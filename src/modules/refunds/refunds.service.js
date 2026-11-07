// Refunds (BR-REF): the customer asks on a delivered order; the vendor accepts (full or part) or
// rejects before the deadline, then marks it paid; the customer confirms or disputes. Admins comment
// and escalate but never move vendor money. A missed deadline runs `refundMissedAction`.
// Reference: foodie-fe src/mocks/handlers/refunds.js and admin-ops.js (comments, escalate).
import { Op } from 'sequelize';
import { logger } from '../../config/logger.js';
import { audit } from '../../core/audit/index.js';
import { adminsWithPermission, permissionsFor } from '../../core/auth/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { addJob, jobId } from '../../core/queue/index.js';
import { lockForUpdate, models, newId, withTransaction } from '../../db/index.js';
import { notify } from '../notifications/notifications.service.js';
import { ownUpload } from '../onboarding/onboarding.shared.js';
import { getSettings } from '../settings/settings.service.js';

const { Order, Refund, Vendor } = models;

const NOT_FOUND = "We couldn't find that refund.";
const MAX_PHOTOS = 3;
const iso = (date) => (date ? new Date(date).toISOString() : null);
const step = (status, by, note = null) => ({ status, at: new Date().toISOString(), by, note });
const text = (value, max) =>
  String(value ?? '')
    .trim()
    .slice(0, max);

/** Refund (contract). Internal `comments` only for admins. */
export const toRefundDto = (r, viewer) => ({
  id: r.id,
  orderId: r.orderId,
  orderCode: r.orderCode,
  customerId: r.customerId,
  customerName: r.customerName,
  vendorId: r.vendorId,
  vendorName: r.vendorName,
  reason: r.reason,
  details: r.details,
  amount: r.amount,
  orderSubtotal: r.orderSubtotal,
  photos: r.photos ?? [],
  status: r.status,
  deadline: iso(r.deadline),
  vendorResponse: r.vendorResponse ?? null,
  paymentReference: r.paymentReference ?? null,
  escalated: r.escalated,
  timeline: r.timeline ?? [],
  ...(viewer?.role === 'admin' && { comments: r.comments ?? [] }),
  createdAt: iso(r.createdAt),
});

// ── Scope ────────────────────────────────────────────────────────────────────

/** Customers their own, vendors their store's, admins with refunds.view all; riders none. */
const refundScope = async (user) => {
  if (user.role === 'customer') return { customerId: user.id };
  if (user.role === 'vendor') {
    const vendor = await Vendor.findOne({ where: { ownerUserId: user.id }, attributes: ['id'] });
    return { vendorId: vendor?.id ?? '' };
  }
  if (user.role === 'admin' && (await permissionsFor(user)).includes('refunds.view')) return {};
  throw new ForbiddenError();
};

// GET /refunds (handoff section 3): search order code, vendor, customer, reason
const LIST_CONFIG = {
  searchFields: ['orderCode', 'vendorName', 'customerName', 'reason'],
  filters: { status: 'status', vendorId: 'vendorId', orderId: 'orderId' },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', amount: 'amount', deadline: 'deadline', status: 'status' },
};

export const listRefunds = async (user, query) => {
  const scope = await refundScope(user);
  const { data, meta } = await paginate(Refund, buildListQuery(query, LIST_CONFIG, { scope }));
  return { data: data.map((r) => toRefundDto(r, user)), meta };
};

export const getRefund = async (user, id) => {
  const scope = await refundScope(user);
  const refund = await Refund.findOne({ where: { id, ...scope } });
  if (!refund) throw new NotFoundError(NOT_FOUND);
  return toRefundDto(refund, user);
};

/** The refund on an order, for the order detail (null when there is none). */
export const refundForOrder = async (orderId, viewer) => {
  const refund = await Refund.findOne({ where: { orderId } });
  return refund ? toRefundDto(refund, viewer) : null;
};

// ── Deadline ─────────────────────────────────────────────────────────────────

const scheduleDeadline = (refund) =>
  addJob(
    'refunds',
    'refund.deadline',
    { refundId: refund.id },
    { jobId: jobId('refundDeadline', refund.id), delay: Math.max(0, refund.deadline.getTime() - Date.now()) },
  ).catch((err) =>
    logger.error({ err, refundId: refund.id }, 'Could not schedule the refund deadline; the sweep will'),
  );

const tellAdmins = async (payload, transaction) => {
  const admins = await adminsWithPermission('refunds.view', { transaction });
  for (const admin of admins) await notify(admin.id, payload, { transaction });
};

/** Marks the refund escalated with a timeline step and tells the vendor and the customer. */
const escalate = async (refund, { by, note, transaction }) => {
  const vendor = await Vendor.findByPk(refund.vendorId, { attributes: ['ownerUserId'], transaction, paranoid: false });
  await refund.update(
    { status: 'escalated', escalated: true, timeline: [...refund.timeline, step('escalated', by, note)] },
    { transaction },
  );
  await notify(
    vendor?.ownerUserId,
    {
      type: 'refund',
      title: 'A refund was escalated',
      body: `Order KJT-${refund.orderCode}: ${note}`,
      link: `/vendor/refunds/${refund.id}`,
    },
    { transaction },
  );
  await notify(
    refund.customerId,
    {
      type: 'refund',
      title: "We're looking into your refund",
      body: 'Our team has stepped in. We will update you soon.',
      link: `/account/refunds/${refund.id}`,
    },
    { transaction },
  );
};

const MISSED = 'Vendor did not respond before the deadline.';

/**
 * Job `refunds:refund.deadline` (and the hourly sweep): a request still unanswered at its deadline
 * gets `refundMissedAction`: escalate (escalated, admins take over), warn (the vendor and admins
 * are told; it stays open) or suspend (the store is suspended and the refund escalated).
 * Runs once per refund.
 */
export const handleMissedDeadline = async (refundId) => {
  const settings = await getSettings();
  return withTransaction(async (transaction) => {
    const refund = await Refund.findByPk(refundId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!refund || refund.status !== 'requested' || refund.deadlineHandledAt || refund.deadline > new Date()) {
      return { skipped: true };
    }
    const action = settings.refundMissedAction;
    await refund.update({ deadlineHandledAt: new Date() }, { transaction });
    const vendor = await Vendor.findByPk(refund.vendorId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
      paranoid: false,
    });

    if (action === 'warn') {
      await notify(
        vendor?.ownerUserId,
        {
          type: 'refund',
          title: 'You missed a refund deadline',
          body: `Order KJT-${refund.orderCode}: answer the customer's refund request now.`,
          link: `/vendor/refunds/${refund.id}`,
        },
        { transaction },
      );
    } else {
      await escalate(refund, { by: 'system', note: MISSED, transaction });
      await audit.log(
        {
          actor: null,
          action: 'refund.escalated',
          targetType: 'refund',
          targetId: refund.id,
          summary: `KJT-${refund.orderCode}: ${MISSED}`,
        },
        { transaction },
      );
    }
    if (action === 'suspend' && vendor && vendor.approvalStatus === 'approved') {
      const reason = `Missed the refund deadline on order KJT-${refund.orderCode}.`;
      await vendor.update({ approvalStatus: 'suspended', suspensionReason: reason }, { transaction });
      await audit.log(
        {
          actor: null,
          action: 'vendor.suspend',
          targetType: 'vendor',
          targetId: vendor.id,
          summary: `${vendor.name}: ${reason}`,
        },
        { transaction },
      );
    }
    await tellAdmins(
      {
        type: 'refund',
        title: 'Refund deadline missed',
        body: `Order KJT-${refund.orderCode} from ${refund.vendorName}: ${action === 'warn' ? 'vendor warned' : action === 'suspend' ? 'store suspended, refund escalated' : 'refund escalated'}.`,
        link: `/admin/refunds/${refund.id}`,
      },
      transaction,
    );
    return { handled: refund.id, action };
  });
};

/** Job `refunds:refunds.sweep` (hourly): deadlines the delayed jobs missed. */
export const sweepMissedDeadlines = async () => {
  const overdue = await Refund.findAll({
    where: { status: 'requested', deadlineHandledAt: null, deadline: { [Op.lte]: new Date() } },
    attributes: ['id'],
  });
  for (const { id } of overdue) {
    await handleMissedDeadline(id).catch((err) => logger.error({ err, refundId: id }, 'Missed-deadline action failed'));
  }
  return { handled: overdue.length };
};

// ── Customer ─────────────────────────────────────────────────────────────────

/**
 * POST /refunds `{ orderId, reason, amount, details?, photos? }`: delivered orders only, one per
 * order (409), amount up to the food subtotal, photos are the customer's own refund uploads (≤ 3).
 * The vendor is told and must answer within refundDeadlineHours.
 */
export const createRefund = async (user, body) => {
  const settings = await getSettings();
  const refund = await withTransaction(async (transaction) => {
    const order = await lockForUpdate(Order, String(body.orderId ?? ''), transaction, {
      where: { customerId: user.id },
      message: "We couldn't find that order.",
    });
    if (order.status !== 'delivered') {
      throw new ConflictError('INVALID_STATUS', 'You can ask for a refund once the order is delivered.');
    }
    if (await Refund.count({ where: { orderId: order.id }, transaction })) {
      throw new ConflictError('ALREADY_SUBMITTED', 'There is already a refund request for this order.');
    }

    const errors = {};
    const reason = text(body.reason, 100);
    const amount = Math.round(Number(body.amount));
    const details = String(body.details ?? '').trim();
    if (!reason) errors.reason = 'Pick a reason';
    if (!(amount > 0)) errors.amount = 'Enter the amount you want back';
    else if (amount > order.subtotal) errors.amount = 'You can ask for up to the food subtotal';
    if (details.length > 500) errors.details = 'Keep it under 500 characters';
    const urls = Array.isArray(body.photos) ? body.photos : [];
    if (urls.length > MAX_PHOTOS) errors.photos = `Add up to ${MAX_PHOTOS} photos`;
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const photos = [];
    for (const [i, url] of urls.entries()) {
      photos.push((await ownUpload(user, url, 'refund_photo', { transaction, field: `photos.${i}` })).url);
    }

    const created = await Refund.create(
      {
        id: newId(),
        orderId: order.id,
        customerId: user.id,
        vendorId: order.vendorId,
        orderCode: order.code,
        customerName: user.name,
        vendorName: order.vendorName,
        reason,
        details,
        amount,
        orderSubtotal: order.subtotal,
        photos,
        deadline: new Date(Date.now() + settings.refundDeadlineHours * 3600_000),
        timeline: [step('requested', 'customer', details || null)],
        comments: [],
      },
      { transaction },
    );
    const vendor = await Vendor.findByPk(order.vendorId, { attributes: ['ownerUserId'], transaction, paranoid: false });
    await notify(
      vendor?.ownerUserId,
      {
        type: 'refund',
        title: 'New refund request',
        body: `Order KJT-${order.code}: ${reason}. Respond within ${settings.refundDeadlineHours} h.`,
        link: '/vendor/refunds',
      },
      { transaction },
    );
    return created;
  });
  await scheduleDeadline(refund);
  return toRefundDto(refund, user);
};

const customerRefund = (user, id, transaction) =>
  lockForUpdate(Refund, id, transaction, { where: { customerId: user.id }, message: NOT_FOUND });

/** POST /refunds/{id}/confirm: the customer got the money (paid only, 409 otherwise). */
export const confirmRefund = async (user, id) =>
  withTransaction(async (transaction) => {
    const refund = await customerRefund(user, id, transaction);
    if (refund.status !== 'paid') {
      throw new ConflictError('INVALID_STATUS', 'You can confirm once the vendor marks the refund as paid.');
    }
    await refund.update(
      { status: 'confirmed', timeline: [...refund.timeline, step('confirmed', 'customer')] },
      { transaction },
    );
    return toRefundDto(refund, user);
  });

/** POST /refunds/{id}/dispute `{ reason }`: after the vendor answered (paid or rejected); admins are told. */
export const disputeRefund = async (user, id, { reason }) =>
  withTransaction(async (transaction) => {
    const refund = await customerRefund(user, id, transaction);
    if (!['paid', 'rejected'].includes(refund.status)) {
      throw new ConflictError('INVALID_STATUS', 'You can dispute after the vendor responds.');
    }
    const note = text(reason, 500);
    if (!note) throw new ValidationError({ reason: 'Tell us what went wrong' });
    await refund.update(
      { status: 'disputed', timeline: [...refund.timeline, step('disputed', 'customer', note)] },
      { transaction },
    );
    await tellAdmins(
      {
        type: 'refund',
        title: 'Refund disputed',
        body: `Order KJT-${refund.orderCode}: ${note.slice(0, 80)}`,
        link: `/admin/refunds/${refund.id}`,
      },
      transaction,
    );
    return toRefundDto(refund, user);
  });

// ── Vendor ───────────────────────────────────────────────────────────────────

const vendorRefund = async (user, id, transaction) => {
  const vendor = await Vendor.findOne({ where: { ownerUserId: user.id }, attributes: ['id'], transaction });
  return lockForUpdate(Refund, id, transaction, { where: { vendorId: vendor?.id ?? '' }, message: NOT_FOUND });
};

/**
 * POST /refunds/{id}/respond `{ decision, amount?, reason? }`: accept (full or part, up to the food
 * subtotal) or reject with a reason, once (409 after). Answering after the deadline is still allowed
 * while the request is open (the missed-deadline action may already have escalated it).
 */
export const respondToRefund = async (user, id, body) =>
  withTransaction(async (transaction) => {
    const refund = await vendorRefund(user, id, transaction);
    if (refund.status !== 'requested') {
      throw new ConflictError('INVALID_STATUS', 'You have already answered this refund request.');
    }
    const reason = text(body.reason, 500);
    const at = new Date().toISOString();
    let changes;
    if (body.decision === 'rejected') {
      if (!reason) throw new ValidationError({ reason: 'Tell the customer why' });
      changes = {
        status: 'rejected',
        vendorResponse: { decision: 'rejected', amount: 0, reason, at },
        timeline: [...refund.timeline, step('rejected', 'vendor', reason)],
      };
    } else if (body.decision === 'accepted') {
      const amount = Math.round(Number(body.amount));
      if (!(amount > 0)) throw new ValidationError({ amount: 'Enter the amount you will refund' });
      if (amount > refund.orderSubtotal)
        throw new ValidationError({ amount: 'You can refund up to the food subtotal' });
      changes = {
        status: 'accepted',
        amount,
        vendorResponse: { decision: 'accepted', amount, reason: reason || null, at },
        timeline: [...refund.timeline, step('accepted', 'vendor', reason || null)],
      };
    } else throw new ValidationError({ decision: 'Accept or reject the request' });

    await refund.update(changes, { transaction });
    await notify(
      refund.customerId,
      {
        type: 'refund',
        title: refund.status === 'accepted' ? 'Your refund was accepted' : 'Your refund was declined',
        body: `Order KJT-${refund.orderCode}: ${reason || 'The vendor will pay you back soon.'}`,
        link: `/account/refunds/${refund.id}`,
      },
      { transaction },
    );
    return toRefundDto(refund, user);
  });

/** POST /refunds/{id}/mark-paid `{ reference }`: accepted → paid; the customer is asked to confirm. */
export const markRefundPaid = async (user, id, { reference }) =>
  withTransaction(async (transaction) => {
    const refund = await vendorRefund(user, id, transaction);
    if (refund.status !== 'accepted') {
      throw new ConflictError('INVALID_STATUS', 'Accept the refund before you mark it as paid.');
    }
    const ref = text(reference, 60);
    if (ref.length < 4) throw new ValidationError({ reference: 'Enter the transfer or Paystack refund reference' });
    await refund.update(
      {
        status: 'paid',
        paymentReference: ref,
        timeline: [...refund.timeline, step('paid', 'vendor', `Reference ${ref}`)],
      },
      { transaction },
    );
    await notify(
      refund.customerId,
      {
        type: 'refund',
        title: 'Your refund has been paid',
        body: `Check your account and confirm you got it (reference ${ref}).`,
        link: `/account/refunds/${refund.id}`,
      },
      { transaction },
    );
    return toRefundDto(refund, user);
  });

// ── Admin ────────────────────────────────────────────────────────────────────

/** POST /refunds/{id}/comments `{ body }` (refunds.view): an internal note for the team. */
export const addComment = async (actor, id, { body }) =>
  withTransaction(async (transaction) => {
    const refund = await lockForUpdate(Refund, id, transaction, { message: NOT_FOUND });
    const note = text(body, 1000);
    if (!note) throw new ValidationError({ body: 'Write a comment first' });
    const comment = {
      id: newId(),
      authorId: actor.id,
      authorName: actor.name,
      body: note,
      createdAt: new Date().toISOString(),
    };
    await refund.update({ comments: [...refund.comments, comment] }, { transaction });
    return toRefundDto(refund, actor);
  });

/**
 * POST /refunds/{id}/escalate `{ reason }` (refunds.escalate): the team steps in; not when already
 * confirmed or escalated (409). The vendor and customer are told. Audited.
 */
export const escalateRefund = async (actor, id, { reason }, req) =>
  withTransaction(async (transaction) => {
    const refund = await lockForUpdate(Refund, id, transaction, { message: NOT_FOUND });
    if (['confirmed', 'escalated'].includes(refund.status)) {
      throw new ConflictError('INVALID_STATUS', 'This refund is already closed or escalated.');
    }
    const note = text(reason, 500);
    if (!note) throw new ValidationError({ reason: 'Give a reason' });
    await escalate(refund, { by: 'admin', note, transaction });
    await audit.log(
      {
        actor,
        action: 'refund.escalated',
        targetType: 'refund',
        targetId: refund.id,
        summary: `KJT-${refund.orderCode}: ${note}`,
        req,
      },
      { transaction },
    );
    return toRefundDto(refund, actor);
  });
