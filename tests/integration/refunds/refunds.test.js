import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { handleMissedDeadline, sweepMissedDeadlines } from '../../../src/modules/refunds/refunds.service.js';
import { updateSettings } from '../../../src/modules/settings/settings.service.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createOrderRow, createPublicVendor, createUpload, createUser } from '../../helpers/factories.js';

const { AuditLog, Notification, Refund, Vendor } = models;

let ada;
let owner;
let vendor;
let order;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  ({ owner, vendor } = await createPublicVendor({ vendor: { name: 'Mama Put Kitchen' } }));
  // Food subtotal ₦5,000
  order = await createOrderRow({ customer: ada, vendor });
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

const ask = (body = {}) =>
  api('post', '/refunds', ada, { orderId: order.id, reason: 'Food arrived cold', amount: 250000, ...body });

describe('POST /refunds', () => {
  it('opens a request with a deadline and tells the vendor', async () => {
    const photo = await createUpload(ada, 'refund_photo');
    const res = await ask({ details: ' The rice was cold. ', photos: [photo.url] });
    expect(res.status).toBe(201);
    const deadline = new Date(res.body.data.deadline).getTime() - new Date(res.body.data.createdAt).getTime();
    expect(Math.round(deadline / 3600_000)).toBe(48);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      orderId: order.id,
      orderCode: order.code,
      customerId: ada.id,
      customerName: 'Ada Okafor',
      vendorId: vendor.id,
      vendorName: 'Mama Put Kitchen',
      reason: 'Food arrived cold',
      details: 'The rice was cold.',
      amount: 250000,
      orderSubtotal: 500000,
      photos: [photo.url],
      status: 'requested',
      deadline: expect.any(String),
      vendorResponse: null,
      paymentReference: null,
      escalated: false,
      timeline: [{ status: 'requested', at: expect.any(String), by: 'customer', note: 'The rice was cold.' }],
      createdAt: expect.any(String),
    });
    expect(await Notification.count({ where: { userId: owner.id, type: 'refund', title: 'New refund request' } })).toBe(
      1,
    );
    // The order detail carries it
    expect((await api('get', `/orders/${order.id}`, ada)).body.data.refund).toMatchObject({ id: res.body.data.id });
  });

  it('one per delivered order (409); amount up to the subtotal and own photos (422); customers only', async () => {
    const onTheWay = await createOrderRow({ customer: ada, vendor, status: 'picked_up' });
    expect((await ask({ orderId: onTheWay.id })).body.error.code).toBe('INVALID_STATUS');

    const bad = await ask({ reason: ' ', amount: 600000 });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fieldErrors).toEqual({
      reason: 'Pick a reason',
      amount: 'You can ask for up to the food subtotal',
    });
    const someoneElses = await createUpload(await createUser(), 'refund_photo');
    expect((await ask({ photos: [someoneElses.url] })).body.error.fieldErrors).toEqual({
      'photos.0': 'Upload the file again, then try once more',
    });

    expect((await ask()).status).toBe(201);
    const again = await ask();
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
    expect((await api('post', '/refunds', await createUser(), { orderId: order.id })).status).toBe(404);
    expect((await api('post', '/refunds', owner, { orderId: order.id })).status).toBe(403);
  });
});

describe('the refund’s life', () => {
  it('vendor accepts part, marks paid; the customer confirms', async () => {
    const { id } = (await ask()).body.data;
    expect((await api('post', `/refunds/${id}/mark-paid`, owner, { reference: 'RF_12345' })).status).toBe(409);

    const accepted = await api('post', `/refunds/${id}/respond`, owner, { decision: 'accepted', amount: 150000 });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({
      status: 'accepted',
      amount: 150000,
      vendorResponse: { decision: 'accepted', amount: 150000, reason: null, at: expect.any(String) },
    });
    expect((await api('post', `/refunds/${id}/respond`, owner, { decision: 'rejected', reason: 'No' })).status).toBe(
      409,
    );
    expect(await Notification.count({ where: { userId: ada.id, title: 'Your refund was accepted' } })).toBe(1);

    expect((await api('post', `/refunds/${id}/confirm`, ada)).status).toBe(409);
    const short = await api('post', `/refunds/${id}/mark-paid`, owner, { reference: 'RF' });
    expect(short.body.error.fieldErrors.reference).toBe('Enter the transfer or Paystack refund reference');
    const paid = await api('post', `/refunds/${id}/mark-paid`, owner, { reference: ' RF_12345 ' });
    expect(paid.body.data).toMatchObject({ status: 'paid', paymentReference: 'RF_12345' });

    const confirmed = await api('post', `/refunds/${id}/confirm`, ada);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.timeline.map((s) => [s.status, s.by])).toEqual([
      ['requested', 'customer'],
      ['accepted', 'vendor'],
      ['paid', 'vendor'],
      ['confirmed', 'customer'],
    ]);
  });

  it('vendor rejects with a reason; the customer disputes and support is told', async () => {
    const support = await createUser({ role: 'admin', adminRole: 'support', phone: null });
    const { id } = (await ask()).body.data;
    expect((await api('post', `/refunds/${id}/dispute`, ada, { reason: 'Hmm' })).status).toBe(409);
    expect(
      (await api('post', `/refunds/${id}/respond`, owner, { decision: 'rejected' })).body.error.fieldErrors,
    ).toEqual({
      reason: 'Tell the customer why',
    });
    expect((await api('post', `/refunds/${id}/respond`, owner, { decision: 'maybe' })).body.error.fieldErrors).toEqual({
      decision: 'Accept or reject the request',
    });
    const rejected = await api('post', `/refunds/${id}/respond`, owner, {
      decision: 'rejected',
      reason: 'Delivered hot',
    });
    expect(rejected.body.data).toMatchObject({
      status: 'rejected',
      vendorResponse: { decision: 'rejected', amount: 0 },
    });

    expect((await api('post', `/refunds/${id}/dispute`, ada, { reason: '  ' })).status).toBe(422);
    const disputed = await api('post', `/refunds/${id}/dispute`, ada, { reason: 'It was cold, see the photo' });
    expect(disputed.body.data.status).toBe('disputed');
    expect(await Notification.count({ where: { userId: support.id, title: 'Refund disputed' } })).toBe(1);
  });
});

describe('scoped reads', () => {
  it('customers see their own, vendors their store’s, admins with refunds.view all (with comments)', async () => {
    const { id } = (await ask()).body.data;
    const { owner: otherOwner } = await createPublicVendor();
    const support = await createUser({ role: 'admin', adminRole: 'support', phone: null });

    expect((await api('get', '/refunds', ada)).body.meta.total).toBe(1);
    expect((await api('get', '/refunds', owner)).body.meta.total).toBe(1);
    expect((await api('get', '/refunds', otherOwner)).body.meta.total).toBe(0);
    expect((await api('get', `/refunds/${id}`, otherOwner)).status).toBe(404);
    expect((await api('get', `/refunds/${id}`, await createUser())).status).toBe(404);
    expect((await api('get', '/refunds?search=cold', support)).body.meta.total).toBe(1);
    expect((await api('get', `/refunds/${id}`, ada)).body.data.comments).toBeUndefined();
    expect((await api('get', `/refunds/${id}`, support)).body.data.comments).toEqual([]);

    const onboarding = await createUser({ role: 'admin', adminRole: 'onboarding', phone: null });
    expect((await api('get', '/refunds', onboarding)).status).toBe(403);
    expect((await api('get', '/refunds')).status).toBe(401);
  });
});

describe('admin comments and escalation', () => {
  it('comments are internal; escalation tells both sides and is audited', async () => {
    const support = await createUser({
      role: 'admin',
      adminRole: 'support',
      firstName: 'Sade',
      lastName: 'Support',
      phone: null,
    });
    const { id } = (await ask()).body.data;

    const commented = await api('post', `/refunds/${id}/comments`, support, { body: ' Called the vendor ' });
    expect(commented.status).toBe(200);
    expect(commented.body.data.comments).toEqual([
      {
        id: expect.any(String),
        authorId: support.id,
        authorName: 'Sade Support',
        body: 'Called the vendor',
        createdAt: expect.any(String),
      },
    ]);
    expect((await api('post', `/refunds/${id}/comments`, support, { body: '' })).status).toBe(422);

    expect((await api('post', `/refunds/${id}/escalate`, support, {})).body.error.fieldErrors).toEqual({
      reason: 'Give a reason',
    });
    const escalated = await api('post', `/refunds/${id}/escalate`, support, { reason: 'Vendor unreachable' });
    expect(escalated.body.data).toMatchObject({ status: 'escalated', escalated: true });
    expect(escalated.body.data.timeline.at(-1)).toMatchObject({
      status: 'escalated',
      by: 'admin',
      note: 'Vendor unreachable',
    });
    expect(await Notification.count({ where: { userId: owner.id, title: 'A refund was escalated' } })).toBe(1);
    expect(await Notification.count({ where: { userId: ada.id, title: "We're looking into your refund" } })).toBe(1);
    expect(await AuditLog.count({ where: { action: 'refund.escalated', targetId: id } })).toBe(1);
    expect((await api('post', `/refunds/${id}/escalate`, support, { reason: 'Again' })).status).toBe(409);

    const finance = await createUser({ role: 'admin', adminRole: 'finance', phone: null });
    expect((await api('post', `/refunds/${id}/escalate`, finance, { reason: 'x' })).status).toBe(403);
  });
});

describe('missed deadline', () => {
  const overdue = async () => {
    const { id } = (await ask()).body.data;
    await Refund.update({ deadline: new Date(Date.now() - 1000) }, { where: { id } });
    return id;
  };

  it('escalate (default): escalated by the system, once', async () => {
    const id = await overdue();
    expect(await handleMissedDeadline(id)).toEqual({ handled: id, action: 'escalate' });
    const refund = await Refund.findByPk(id);
    expect(refund).toMatchObject({ status: 'escalated', escalated: true });
    expect(refund.timeline.at(-1)).toMatchObject({ by: 'system', note: 'Vendor did not respond before the deadline.' });
    expect(await handleMissedDeadline(id)).toEqual({ skipped: true });
    expect(await sweepMissedDeadlines()).toEqual({ handled: 0 });
  });

  it('warn: the vendor is told and the request stays open; suspend: the store is suspended too', async () => {
    await updateSettings(null, { refundMissedAction: 'warn' });
    const id = await overdue();
    expect(await sweepMissedDeadlines()).toEqual({ handled: 1 });
    expect(await Refund.findByPk(id)).toMatchObject({ status: 'requested' });
    expect(await Notification.count({ where: { userId: owner.id, title: 'You missed a refund deadline' } })).toBe(1);
    // The vendor can still answer
    expect((await api('post', `/refunds/${id}/respond`, owner, { decision: 'accepted', amount: 100000 })).status).toBe(
      200,
    );

    await updateSettings(null, { refundMissedAction: 'suspend' });
    order = await createOrderRow({ customer: ada, vendor });
    const second = await overdue();
    await handleMissedDeadline(second);
    expect(await Refund.findByPk(second)).toMatchObject({ status: 'escalated' });
    expect(await Vendor.findByPk(vendor.id)).toMatchObject({ approvalStatus: 'suspended' });
  });
});
