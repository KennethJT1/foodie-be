// Help tickets (customers, vendors, riders) and the admin support inbox. Internal notes are
// messages with `internal` set and never reach the ticket's owner.
// Reference: foodie-fe src/mocks/handlers/support.js and admin-ops.js (inbox, agents).
import { Op, UniqueConstraintError } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { adminsWithPermission, permissionsFor } from '../../core/auth/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { notify } from '../notifications/notifications.service.js';

const { Order, Rider, SupportMessage, SupportTicket, User, Vendor } = models;

const NOT_FOUND = "We couldn't find that ticket.";
const FIRST_NUMBER = 1000;
const iso = (date) => (date ? new Date(date).toISOString() : null);
const text = (value, max) =>
  String(value ?? '')
    .trim()
    .slice(0, max);
const HOME = { customer: '/account/support', vendor: '/vendor/support', rider: '/rider/support' };

// ── Shapes ───────────────────────────────────────────────────────────────────

const toMessageDto = (m) => ({
  id: m.id,
  authorId: m.authorId,
  authorName: m.authorName,
  authorRole: m.authorRole,
  body: m.body,
  internal: m.internal,
  createdAt: iso(m.createdAt),
});

const ticketFields = (t) => ({
  id: t.id,
  number: t.number,
  userId: t.userId,
  userName: t.userName,
  userRole: t.userRole,
  orderId: t.orderId,
  orderCode: t.orderCode,
  subject: t.subject,
  status: t.status,
  priority: t.priority,
  assigneeId: t.assigneeId,
  assigneeName: t.assignee?.name ?? null,
  createdAt: iso(t.createdAt),
  updatedAt: iso(t.updatedAt),
});

/** Ticket with its conversation; owners never see internal notes. */
const toTicketDto = (t, messages, { internal = false } = {}) => ({
  ...ticketFields(t),
  messages: messages.filter((m) => internal || !m.internal).map(toMessageDto),
});

const assigneeInclude = { model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName'] };

const loadTicket = async (id, { internal = false, transaction } = {}) => {
  const ticket = await SupportTicket.findByPk(id, { include: [assigneeInclude], transaction });
  const messages = await SupportMessage.findAll({
    where: { ticketId: id },
    order: [['createdAt', 'ASC']],
    transaction,
  });
  return toTicketDto(ticket, messages, { internal });
};

/**
 * Adds a message and keeps the ticket's previews (last public message, hasReply, count) in step,
 * saving `changes` to the ticket in the same update.
 */
const addMessage = async (
  ticket,
  author,
  { body, internal = false, role = author.role, changes = {} },
  transaction,
) => {
  await SupportMessage.create(
    { ticketId: ticket.id, authorId: author.id, authorName: author.name, authorRole: role, body, internal },
    { transaction },
  );
  await ticket.update(
    {
      messageCount: ticket.messageCount + 1,
      ...(!internal && { lastMessage: body, hasReply: role === 'admin' }),
      ...changes,
    },
    { transaction },
  );
};

/** The assignee, or every active support agent when nobody has it. */
const notifyAgents = async (ticket, title, transaction) => {
  const agents = ticket.assigneeId
    ? [{ id: ticket.assigneeId }]
    : await adminsWithPermission('support.manage', { transaction });
  for (const agent of agents) {
    await notify(
      agent.id,
      {
        type: 'system',
        title,
        body: `#${ticket.number}: ${ticket.subject}`,
        link: `/admin/support?ticket=${ticket.id}`,
      },
      { transaction },
    );
  }
};

// ── The user's tickets ───────────────────────────────────────────────────────

// GET /support/tickets (handoff section 3): search subject, number; newest activity first
const MY_TICKETS = {
  searchFields: ['subject', 'number'],
  filters: { status: 'status' },
  dateField: 'updatedAt',
  defaultSort: '-updatedAt',
  sortable: { updatedAt: 'updatedAt', createdAt: 'createdAt', number: 'number', status: 'status' },
  include: [assigneeInclude],
};

export const listMyTickets = async (user, query) => {
  const { data, meta } = await paginate(
    SupportTicket,
    buildListQuery(query, MY_TICKETS, { scope: { userId: user.id } }),
  );
  return {
    data: data.map((t) => ({ ...ticketFields(t), lastMessage: t.lastMessage, hasReply: t.hasReply })),
    meta,
  };
};

/** Orders the user may attach: customers their own, vendors their store's, riders their trips. */
const usableOrder = async (user, orderId, transaction) => {
  if (!orderId) return null;
  const order = await Order.findByPk(String(orderId), {
    attributes: ['id', 'code', 'customerId', 'vendorId', 'riderId'],
    transaction,
  });
  if (!order) return undefined;
  if (user.role === 'customer') return order.customerId === user.id ? order : undefined;
  if (user.role === 'vendor') {
    const vendor = await Vendor.findOne({ where: { ownerUserId: user.id }, attributes: ['id'], transaction });
    return vendor && order.vendorId === vendor.id ? order : undefined;
  }
  const rider = await Rider.findOne({ where: { userId: user.id }, attributes: ['id'], transaction });
  return rider && order.riderId === rider.id ? order : undefined;
};

const HIGH_PRIORITY = /refund|money|debit|paid|payout/i;

/**
 * POST /support/tickets `{ subject, body, orderId? }`: opens a ticket (subject ≥ 4, body ≥ 10
 * characters; the order must be one of the user's). Money words make it high priority. Agents are told.
 */
export const createTicket = async (user, body) => {
  const subject = text(body.subject, 120);
  const message = text(body.body, 2000);
  const errors = {};
  if (subject.length < 4) errors.subject = 'Say what it is about in a few words';
  if (message.length < 10) errors.body = 'Tell us a bit more so we can help';
  const order = await usableOrder(user, body.orderId);
  if (body.orderId && !order) errors.orderId = 'Pick one of your orders';
  if (Object.keys(errors).length) throw new ValidationError(errors);

  // The next number; two tickets at once collide on the unique index, so try again
  for (let attempt = 0; ; attempt += 1) {
    try {
      const id = await withTransaction(async (transaction) => {
        const last = (await SupportTicket.max('number', { transaction })) ?? FIRST_NUMBER - 1;
        const ticket = await SupportTicket.create(
          {
            number: last + 1,
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            orderId: order?.id ?? null,
            orderCode: order?.code ?? null,
            subject,
            priority: HIGH_PRIORITY.test(`${subject} ${message}`) ? 'high' : 'normal',
          },
          { transaction },
        );
        await addMessage(ticket, user, { body: message }, transaction);
        await notifyAgents(ticket, 'New support ticket', transaction);
        return ticket.id;
      });
      return loadTicket(id);
    } catch (err) {
      if (!(err instanceof UniqueConstraintError) || attempt >= 4) throw err;
    }
  }
};

const ownTicket = (user, id, transaction) =>
  lockForUpdate(SupportTicket, id, transaction, { where: { userId: user.id }, message: NOT_FOUND });

/** GET /support/tickets/{id}: the user's own ticket (404 otherwise), without internal notes. */
export const getMyTicket = async (user, id) => {
  const ticket = await SupportTicket.findOne({ where: { id, userId: user.id }, attributes: ['id'] });
  if (!ticket) throw new NotFoundError(NOT_FOUND);
  return loadTicket(id);
};

/** POST /support/tickets/{id}/messages `{ body }`: not when closed (409); pending / resolved → open. */
export const replyToMyTicket = async (user, id, { body }) => {
  const message = text(body, 2000);
  if (!message) throw new ValidationError({ body: 'Write a message first' });
  await withTransaction(async (transaction) => {
    const ticket = await ownTicket(user, id, transaction);
    if (ticket.status === 'closed') {
      throw new ConflictError('INVALID_STATUS', 'This ticket is closed. Open a new one if you still need help.');
    }
    // A reply re-opens a ticket that was waiting on them or already resolved
    const changes = ['pending', 'resolved'].includes(ticket.status) ? { status: 'open' } : {};
    await addMessage(ticket, user, { body: message, changes }, transaction);
    await notifyAgents(ticket, 'Customer replied', transaction);
  });
  return loadTicket(id);
};

/** POST /support/tickets/{id}/resolve: the user says it's solved. */
export const resolveMyTicket = async (user, id) => {
  await withTransaction(async (transaction) => {
    const ticket = await ownTicket(user, id, transaction);
    await ticket.update({ status: 'resolved' }, { transaction });
  });
  return loadTicket(id);
};

// ── Admin inbox ──────────────────────────────────────────────────────────────

// GET /admin/tickets (handoff section 3): search subject, user, number, order code
const inboxConfig = (me) => ({
  searchFields: ['subject', 'userName', 'number', 'orderCode'],
  filters: {
    status: 'status',
    priority: 'priority',
    userRole: 'userRole',
    assignee: ([value]) =>
      value === 'me' ? { assigneeId: me.id } : value === 'none' ? { assigneeId: null } : { assigneeId: value },
  },
  dateField: 'updatedAt',
  defaultSort: '-updatedAt',
  sortable: {
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
    number: 'number',
    priority: 'priority',
    status: 'status',
  },
  include: [assigneeInclude],
});

export const listInbox = async (me, query) => {
  const { data, meta } = await paginate(SupportTicket, buildListQuery(query, inboxConfig(me)));
  return {
    data: data.map((t) => ({ ...ticketFields(t), lastMessage: t.lastMessage, messageCount: t.messageCount })),
    meta,
  };
};

export const getTicket = async (id) => {
  if (!(await SupportTicket.count({ where: { id } }))) throw new NotFoundError(NOT_FOUND);
  return loadTicket(id, { internal: true });
};

/** An active admin who holds support.manage, or a 422 on assigneeId. */
const agentFor = async (id, transaction) => {
  const agent = await User.findOne({ where: { id: String(id), role: 'admin', status: 'active' }, transaction });
  if (!agent || !(await permissionsFor(agent)).includes('support.manage')) {
    throw new ValidationError({ assigneeId: 'Pick a support agent' });
  }
  return agent;
};

/** PATCH /admin/tickets/{id} `{ status?, priority?, assigneeId? }`: audited `ticket.updated`. */
export const updateTicket = async (actor, id, body, req) => {
  await withTransaction(async (transaction) => {
    const ticket = await lockForUpdate(SupportTicket, id, transaction, { message: NOT_FOUND });
    const changes = {};
    if (body.status !== undefined) changes.status = body.status;
    if (body.priority !== undefined) changes.priority = body.priority;
    if (body.assigneeId !== undefined) {
      changes.assigneeId = body.assigneeId ? (await agentFor(body.assigneeId, transaction)).id : null;
    }
    const keys = Object.keys(changes);
    if (!keys.length) return;
    await ticket.update(changes, { transaction });
    await audit.log(
      {
        actor,
        action: 'ticket.updated',
        targetType: 'ticket',
        targetId: ticket.id,
        summary: `#${ticket.number}: ${keys.map((k) => (k === 'assigneeId' ? 'assignee' : k)).join(', ')}`,
        req,
      },
      { transaction },
    );
  });
  return loadTicket(id, { internal: true });
};

/**
 * POST /admin/tickets/{id}/messages `{ body, internal? }`: a reply (the user is told; open →
 * pending) or an internal note. The first agent to write takes the ticket if nobody has it.
 */
export const replyAsAgent = async (actor, id, { body, internal = false }) => {
  const message = text(body, 2000);
  if (!message) throw new ValidationError({ body: 'Write a reply first' });
  await withTransaction(async (transaction) => {
    const ticket = await lockForUpdate(SupportTicket, id, transaction, { message: NOT_FOUND });
    const changes = {
      ...(!ticket.assigneeId && { assigneeId: actor.id }),
      ...(!internal && ticket.status === 'open' && { status: 'pending' }),
    };
    await addMessage(
      ticket,
      actor,
      { body: message, internal: Boolean(internal), role: 'admin', changes },
      transaction,
    );
    if (!internal) {
      await notify(
        ticket.userId,
        {
          type: 'system',
          title: `Reply on ticket #${ticket.number}`,
          body: message.slice(0, 80),
          link: HOME[ticket.userRole],
        },
        { transaction },
      );
    }
  });
  return loadTicket(id, { internal: true });
};

/** GET /admin/agents: active admins who can answer tickets. */
export const listAgents = async () => {
  const admins = await User.findAll({
    where: { role: 'admin', status: 'active', adminRole: { [Op.ne]: null } },
    order: [
      ['firstName', 'ASC'],
      ['lastName', 'ASC'],
    ],
  });
  const allowed = await Promise.all(admins.map(async (u) => (await permissionsFor(u)).includes('support.manage')));
  return admins.filter((u, i) => allowed[i]).map((u) => ({ id: u.id, name: u.name }));
};
