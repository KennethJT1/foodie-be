import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createOrderRow, createPublicVendor, createUser } from '../../helpers/factories.js';

const { Notification, Order, Rider, Vendor } = models;

let ada;
let owner;
let vendor;
let rider;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  ({ owner, vendor } = await createPublicVendor({ vendor: { name: 'Mama Put Kitchen', rating: 4, ratingCount: 1 } }));
  const riderUser = await createUser({
    role: 'rider',
    rider: { approvalStatus: 'approved', rating: 5, ratingCount: 3 },
  });
  rider = await Rider.findOne({ where: { userId: riderUser.id } });
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

const deliveredOrder = (overrides = {}) => createOrderRow({ customer: ada, vendor, rider, ...overrides });

describe('POST /orders/{id}/reviews', () => {
  it('rates the vendor and the rider once each, updating their ratings and the order flags', async () => {
    const order = await deliveredOrder();
    const res = await api('post', `/orders/${order.id}/reviews`, ada, {
      targetType: 'vendor',
      rating: 5,
      comment: '  Delicious!  ',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      orderId: order.id,
      targetType: 'vendor',
      targetId: vendor.id,
      userId: ada.id,
      userName: 'Ada Okafor',
      rating: 5,
      comment: 'Delicious!',
      reply: null,
      repliedAt: null,
      createdAt: expect.any(String),
    });
    expect(await Vendor.findByPk(vendor.id)).toMatchObject({ rating: 4.5, ratingCount: 2 });
    expect(await Notification.count({ where: { userId: owner.id, title: 'New 5-star review' } })).toBe(1);

    const riderReview = await api('post', `/orders/${order.id}/reviews`, ada, { targetType: 'rider', rating: 3 });
    expect(riderReview.status).toBe(201);
    expect(riderReview.body.data).toMatchObject({ targetId: rider.id, comment: '' });
    expect(await Rider.findByPk(rider.id)).toMatchObject({ rating: 4.5, ratingCount: 4 });
    expect(await Order.findByPk(order.id)).toMatchObject({ ratedVendor: true, ratedRider: true });

    const again = await api('post', `/orders/${order.id}/reviews`, ada, { targetType: 'vendor', rating: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
  });

  it('409 before delivery; 404 for someone else’s order; 422 for bad input; customers only', async () => {
    const onTheWay = await deliveredOrder({ status: 'picked_up' });
    const early = await api('post', `/orders/${onTheWay.id}/reviews`, ada, { targetType: 'vendor', rating: 4 });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('INVALID_STATUS');

    const order = await deliveredOrder();
    expect(
      (await api('post', `/orders/${order.id}/reviews`, await createUser(), { targetType: 'vendor', rating: 4 }))
        .status,
    ).toBe(404);
    const bad = await api('post', `/orders/${order.id}/reviews`, ada, { targetType: 'store', rating: 6 });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fieldErrors).sort()).toEqual(['rating', 'targetType']);
    const long = await api('post', `/orders/${order.id}/reviews`, ada, {
      targetType: 'vendor',
      rating: 4,
      comment: 'x'.repeat(501),
    });
    expect(long.body.error.fieldErrors.comment).toBe('Keep it under 500 characters');
    expect((await api('post', `/orders/${order.id}/reviews`, owner, { targetType: 'vendor', rating: 4 })).status).toBe(
      403,
    );
    expect((await api('post', `/orders/${order.id}/reviews`, null, { targetType: 'vendor', rating: 4 })).status).toBe(
      401,
    );
  });

  it('404 when the order had no rider to rate', async () => {
    const order = await createOrderRow({ customer: ada, vendor });
    const res = await api('post', `/orders/${order.id}/reviews`, ada, { targetType: 'rider', rating: 4 });
    expect(res.status).toBe(404);
  });
});

describe('GET /reviews', () => {
  it('is public and filters by target, rating and search', async () => {
    const first = await deliveredOrder();
    const second = await deliveredOrder();
    await api('post', `/orders/${first.id}/reviews`, ada, { targetType: 'vendor', rating: 5, comment: 'Great jollof' });
    await api('post', `/orders/${second.id}/reviews`, ada, { targetType: 'vendor', rating: 3, comment: 'Cold food' });
    await api('post', `/orders/${second.id}/reviews`, ada, { targetType: 'rider', rating: 4 });

    const all = await api('get', `/reviews?targetType=vendor&targetId=${vendor.id}`);
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(2);
    expect((await api('get', '/reviews?rating=5,4')).body.data.map((r) => r.rating).sort()).toEqual([4, 5]);
    expect((await api('get', '/reviews?search=jollof')).body.data.map((r) => r.comment)).toEqual(['Great jollof']);
  });
});

describe('POST /reviews/{id}/reply', () => {
  it('the store owner replies once; the reviewer is told', async () => {
    const order = await deliveredOrder();
    const review = (await api('post', `/orders/${order.id}/reviews`, ada, { targetType: 'vendor', rating: 4 })).body
      .data;

    const res = await api('post', `/reviews/${review.id}/reply`, owner, { body: ' Thank you, Ada! ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: review.id, reply: 'Thank you, Ada!', repliedAt: expect.any(String) });
    expect(await Notification.count({ where: { userId: ada.id, title: 'The vendor replied to your review' } })).toBe(1);

    const twice = await api('post', `/reviews/${review.id}/reply`, owner, { body: 'Again' });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('ALREADY_SUBMITTED');
  });

  it('404 for another store’s or a rider review; 422 without a body; vendors only', async () => {
    const order = await deliveredOrder();
    const review = (await api('post', `/orders/${order.id}/reviews`, ada, { targetType: 'vendor', rating: 4 })).body
      .data;
    const riderReview = (await api('post', `/orders/${order.id}/reviews`, ada, { targetType: 'rider', rating: 4 })).body
      .data;
    const { owner: otherOwner } = await createPublicVendor();

    expect((await api('post', `/reviews/${review.id}/reply`, otherOwner, { body: 'Hi' })).status).toBe(404);
    expect((await api('post', `/reviews/${riderReview.id}/reply`, owner, { body: 'Hi' })).status).toBe(404);
    expect((await api('post', `/reviews/${review.id}/reply`, owner, { body: '  ' })).body.error.fieldErrors.body).toBe(
      'Write a reply first',
    );
    expect((await api('post', `/reviews/${review.id}/reply`, ada, { body: 'Hi' })).status).toBe(403);
  });
});
