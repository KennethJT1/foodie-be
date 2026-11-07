import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createOrderRow, createPublicVendor, createUser } from '../../helpers/factories.js';

const { AuditLog, Notification } = models;

let ada;
let agent;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  agent = await createUser({
    role: 'admin',
    adminRole: 'support',
    firstName: 'Sade',
    lastName: 'Support',
    phone: null,
  });
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

const open = (who = ada, body = {}) =>
  api('post', '/support/tickets', who, {
    subject: 'Payment debited but no order',
    body: 'I paid at 2pm and no order showed up.',
    ...body,
  });

describe('help centre', () => {
  it('opens a numbered ticket (money words → high priority) and tells the support agents', async () => {
    const { owner, vendor } = await createPublicVendor();
    const order = await createOrderRow({ customer: ada, vendor });
    const res = await open(ada, { orderId: order.id });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      number: 1000,
      userId: ada.id,
      userName: 'Ada Okafor',
      userRole: 'customer',
      orderId: order.id,
      orderCode: order.code,
      subject: 'Payment debited but no order',
      status: 'open',
      priority: 'high',
      assigneeId: null,
      assigneeName: null,
      messages: [
        {
          id: expect.any(String),
          authorId: ada.id,
          authorName: 'Ada Okafor',
          authorRole: 'customer',
          body: 'I paid at 2pm and no order showed up.',
          internal: false,
          createdAt: expect.any(String),
        },
      ],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(await Notification.count({ where: { userId: agent.id, title: 'New support ticket' } })).toBe(1);

    const second = await open(owner, { subject: 'Menu photos', body: 'How do I add more photos to a dish?' });
    expect(second.body.data).toMatchObject({ number: 1001, priority: 'normal', userRole: 'vendor' });
  });

  it('422 for a short subject or body or someone else’s order; admins use the inbox (403)', async () => {
    const bad = await open(ada, { subject: 'Hi', body: 'Help' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fieldErrors).toEqual({
      subject: 'Say what it is about in a few words',
      body: 'Tell us a bit more so we can help',
    });
    const { vendor } = await createPublicVendor();
    const theirs = await createOrderRow({ customer: await createUser(), vendor });
    expect((await open(ada, { orderId: theirs.id })).body.error.fieldErrors).toEqual({
      orderId: 'Pick one of your orders',
    });
    expect((await open(agent)).status).toBe(403);
    expect((await open(null)).status).toBe(401);
  });

  it('lists only the user’s tickets with lastMessage / hasReply; internal notes never show', async () => {
    const { id } = (await open()).body.data;
    await open(await createUser());
    await api('post', `/admin/tickets/${id}/messages`, agent, { body: 'Checked Paystack, all fine', internal: true });
    await api('post', `/admin/tickets/${id}/messages`, agent, { body: 'We have refunded you.' });

    const mine = await api('get', '/support/tickets', ada);
    expect(mine.body.meta.total).toBe(1);
    expect(mine.body.data[0]).toMatchObject({
      id,
      status: 'pending',
      lastMessage: 'We have refunded you.',
      hasReply: true,
    });
    const detail = (await api('get', `/support/tickets/${id}`, ada)).body.data;
    expect(detail.messages.map((m) => m.body)).toEqual([
      'I paid at 2pm and no order showed up.',
      'We have refunded you.',
    ]);
    expect((await api('get', `/support/tickets/${id}`, await createUser())).status).toBe(404);
    expect((await api('get', '/support/tickets?search=debited', ada)).body.meta.total).toBe(1);
  });

  it('a reply re-opens a pending or resolved ticket; closed tickets refuse replies; the user can resolve', async () => {
    const { id } = (await open()).body.data;
    await api('post', `/admin/tickets/${id}/messages`, agent, { body: 'Can you send the receipt?' });
    const reply = await api('post', `/support/tickets/${id}/messages`, ada, { body: 'Here it is' });
    expect(reply.body.data.status).toBe('open');
    expect(await Notification.count({ where: { userId: agent.id, title: 'Customer replied' } })).toBe(1);
    expect((await api('post', `/support/tickets/${id}/messages`, ada, { body: ' ' })).status).toBe(422);

    expect((await api('post', `/support/tickets/${id}/resolve`, ada)).body.data.status).toBe('resolved');
    expect((await api('post', `/support/tickets/${id}/messages`, ada, { body: 'Actually…' })).body.data.status).toBe(
      'open',
    );

    await api('patch', `/admin/tickets/${id}`, agent, { status: 'closed' });
    const closed = await api('post', `/support/tickets/${id}/messages`, ada, { body: 'Hello?' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('INVALID_STATUS');
  });
});

describe('admin inbox', () => {
  it('replies notify the user and take the ticket; notes stay internal', async () => {
    const { id } = (await open()).body.data;
    const note = await api('post', `/admin/tickets/${id}/messages`, agent, {
      body: 'Looks like a Paystack delay',
      internal: true,
    });
    expect(note.status).toBe(200);
    expect(note.body.data).toMatchObject({ status: 'open', assigneeId: agent.id, assigneeName: 'Sade Support' });
    expect(note.body.data.messages.at(-1)).toMatchObject({ internal: true, authorRole: 'admin' });
    expect(await Notification.count({ where: { userId: ada.id } })).toBe(0);

    const reply = await api('post', `/admin/tickets/${id}/messages`, agent, { body: 'We are on it.' });
    expect(reply.body.data.status).toBe('pending');
    expect(await Notification.count({ where: { userId: ada.id, title: 'Reply on ticket #1000' } })).toBe(1);
    expect((await api('post', `/admin/tickets/${id}/messages`, agent, { body: '' })).body.error.fieldErrors).toEqual({
      body: 'Write a reply first',
    });
    expect((await api('get', `/admin/tickets/${id}`, agent)).body.data.messages).toHaveLength(3);
  });

  it('PATCH changes status, priority and assignee (support agents only), audited', async () => {
    const { id } = (await open()).body.data;
    const other = await createUser({
      role: 'admin',
      adminRole: 'support',
      firstName: 'Tobi',
      lastName: 'Agent',
      phone: null,
    });
    const res = await api('patch', `/admin/tickets/${id}`, agent, {
      status: 'pending',
      priority: 'low',
      assigneeId: other.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'pending',
      priority: 'low',
      assigneeId: other.id,
      assigneeName: 'Tobi Agent',
    });
    expect(await AuditLog.findOne({ where: { action: 'ticket.updated', targetId: id } })).toMatchObject({
      summary: '#1000: status, priority, assignee',
    });

    const finance = await createUser({ role: 'admin', adminRole: 'finance', phone: null });
    expect(
      (await api('patch', `/admin/tickets/${id}`, agent, { assigneeId: finance.id })).body.error.fieldErrors,
    ).toEqual({
      assigneeId: 'Pick a support agent',
    });
    expect((await api('patch', `/admin/tickets/${id}`, agent, { status: 'done' })).status).toBe(422);
    expect((await api('patch', `/admin/tickets/${id}`, agent, { assigneeId: null })).body.data.assigneeId).toBeNull();
  });

  it('lists with assignee me / none, status and search; agents are the support admins', async () => {
    const first = (await open()).body.data;
    await open(await createUser(), { subject: 'App keeps logging me out', body: 'Every few minutes I am signed out.' });
    await api('post', `/admin/tickets/${first.id}/messages`, agent, { body: 'On it' });

    expect((await api('get', '/admin/tickets?assignee=me', agent)).body.data.map((t) => t.id)).toEqual([first.id]);
    expect((await api('get', '/admin/tickets?assignee=none', agent)).body.meta.total).toBe(1);
    expect((await api('get', '/admin/tickets?status=open,pending', agent)).body.meta.total).toBe(2);
    const searched = await api('get', '/admin/tickets?search=logging', agent);
    expect(searched.body.data[0]).toMatchObject({ lastMessage: 'Every few minutes I am signed out.', messageCount: 1 });

    await createUser({ role: 'admin', adminRole: 'finance', phone: null });
    expect((await api('get', '/admin/agents', agent)).body.data).toEqual([{ id: agent.id, name: 'Sade Support' }]);
    expect((await api('get', '/admin/tickets/00000000-0000-7000-8000-000000000000', agent)).status).toBe(404);
  });
});
