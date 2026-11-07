import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { CATEGORIES } from '../../../src/db/seed/data/catalogue.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { dispatchOrder, expireOffer } from '../../../src/modules/deliveries/dispatch.service.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createFoodItem, createPublicVendor, createUser } from '../../helpers/factories.js';

const { Address, AuditLog, Delivery, DeliveryOffer, Notification, Order, Rider } = models;

// Each test drives checkout and dispatch end to end; against a remote test database that is slow
jest.setTimeout(240_000);

let ada;
let owner;
let vendor;
let dish;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await models.Category.bulkCreate(CATEGORIES);
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  // Mama Put's pin: 6.5158, 3.3794 (Yaba)
  ({ owner, vendor } = await createPublicVendor({ vendor: { name: 'Mama Put Kitchen' } }));
  dish = await createFoodItem(vendor, { name: 'Party jollof rice', price: 350000 });
  await Address.create({
    userId: ada.id,
    line1: '5 Commercial Avenue',
    area: 'Yaba',
    city: 'Lagos',
    lat: 6.5095,
    lng: 3.3711,
    isDefault: true,
  });
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

/** An approved rider; `rider` overrides columns (online in Yaba by default). */
const createRider = async (rider = {}, user = {}) => {
  const u = await createUser({
    role: 'rider',
    ...user,
    rider: {
      approvalStatus: 'approved',
      onboardingStep: 'submitted',
      vehicleType: 'motorcycle',
      plateNumber: 'LAG123AB',
      city: 'Lagos',
      isOnline: true,
      lat: 6.52,
      lng: 3.38,
      lastSeenAt: new Date(),
      ...rider,
    },
  });
  u.rider = await Rider.findOne({ where: { userId: u.id } });
  return u;
};

/**
 * A paid order through the real checkout, moved to preparing in the database (the vendor steps are
 * tested in orders.test.js). `ready` then marks it ready through the API, which starts dispatch.
 */
const placeOrder = async ({ ready = true } = {}) => {
  const address = await Address.findOne({ where: { userId: ada.id } });
  const init = await api('post', '/payments/initialize', ada, {
    vendorId: vendor.id,
    addressId: address.id,
    items: [{ foodItemId: dish.id, quantity: 2 }],
  });
  const { id } = (await api('post', '/payments/verify', ada, { reference: init.body.data.reference })).body.data.order;
  const order = await Order.findByPk(id);
  const at = new Date().toISOString();
  await order.update({
    status: 'preparing',
    statusHistory: [
      ...order.statusHistory,
      { status: 'accepted', at, by: 'vendor' },
      { status: 'preparing', at, by: 'vendor' },
    ],
  });
  if (ready) expect((await api('post', `/orders/${id}/ready`, owner)).status).toBe(200);
  return Order.findByPk(id);
};

const offersOf = async (rider) => (await api('get', '/rider/offers', rider)).body.data;

/** Ready order taken by `rider` (offer accepted). */
const assigned = async (rider) => {
  const order = await placeOrder();
  const [offer] = await offersOf(rider);
  expect((await api('post', `/deliveries/offers/${offer.id}/accept`, rider)).status).toBe(200);
  return { order: await Order.findByPk(order.id), delivery: await Delivery.findOne({ where: { orderId: order.id } }) };
};

describe('POST /rider/status', () => {
  it('goes online and offline, saving the position; returns the rider profile', async () => {
    const tunde = await createRider({ isOnline: false, lat: null, lng: null });
    const res = await api('post', '/rider/status', tunde, { isOnline: true, lat: 6.51, lng: 3.37 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: tunde.rider.id, isOnline: true, lat: 6.51, lng: 3.37, payoutPct: 70 });

    const off = await api('post', '/rider/status', tunde, { isOnline: false });
    expect(off.body.data.isOnline).toBe(false);
    expect((await Rider.findByPk(tunde.rider.id)).lastSeenAt).not.toBeNull();
  });

  it('needs an approved rider (409 NOT_APPROVED), a boolean (422), the rider role (403) and a token (401)', async () => {
    const pending = await createRider({ approvalStatus: 'pending' });
    const res = await api('post', '/rider/status', pending, { isOnline: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_APPROVED');

    const rider = await createRider();
    const bad = await api('post', '/rider/status', rider, { isOnline: 'yes', lat: 200 });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fieldErrors)).toEqual(expect.arrayContaining(['isOnline', 'lat']));
    expect((await api('post', '/rider/status', ada, { isOnline: true })).status).toBe(403);
    expect((await api('post', '/rider/status', null, { isOnline: true })).status).toBe(401);
  });

  it('going online offers the nearest waiting order; going offline hands pending offers to the next rider', async () => {
    const order = await placeOrder();
    const tunde = await createRider({ isOnline: false });
    await api('post', '/rider/status', tunde, { isOnline: true, lat: 6.516, lng: 3.38 });
    const [offer] = await offersOf(tunde);
    expect(offer).toMatchObject({ orderId: order.id, status: 'pending' });

    const kemi = await createRider({ lat: 6.6, lng: 3.5 });
    await api('post', '/rider/status', tunde, { isOnline: false });
    expect(await DeliveryOffer.findByPk(offer.id)).toMatchObject({ status: 'expired' });
    expect(await offersOf(kemi)).toEqual([expect.objectContaining({ orderId: order.id })]);
  });
});

describe('dispatch', () => {
  it('offers a ready order to the nearest online, approved, free rider in the city', async () => {
    const far = await createRider({ lat: 6.6, lng: 3.45 });
    const near = await createRider({ lat: 6.516, lng: 3.38 });
    await createRider({ lat: 6.5159, lng: 3.3795, isOnline: false });
    await createRider({ lat: 6.5159, lng: 3.3795, approvalStatus: 'suspended' });
    await createRider({ lat: 6.5159, lng: 3.3795, city: 'Abuja' });
    await createRider({ lat: 6.5159, lng: 3.3795 }, { status: 'banned' });

    const order = await placeOrder();
    const offers = await offersOf(near);
    expect(offers).toEqual([
      {
        id: expect.any(String),
        orderId: order.id,
        orderCode: order.code,
        riderId: near.rider.id,
        status: 'pending',
        fee: order.deliveryFee,
        earning: Math.round((order.deliveryFee * 70) / 100),
        distanceM: order.distanceM,
        toPickupM: expect.any(Number),
        pickup: { name: 'Mama Put Kitchen', area: 'Yaba', lat: 6.5158, lng: 3.3794 },
        dropoff: { area: 'Yaba', city: 'Lagos', lat: 6.5095, lng: 3.3711 },
        expiresAt: expect.any(String),
        createdAt: expect.any(String),
      },
    ]);
    // createdAt is stored to the second
    const expiresIn = (new Date(offers[0].expiresAt) - new Date(offers[0].createdAt)) / 1000;
    expect(expiresIn).toBeGreaterThan(29);
    expect(expiresIn).toBeLessThanOrEqual(31);
    expect(await offersOf(far)).toEqual([]);
  });

  it('a decline or a timeout offers the order to the next rider; nobody left alerts Dispatch once', async () => {
    const near = await createRider({ lat: 6.516, lng: 3.38 });
    const next = await createRider({ lat: 6.53, lng: 3.39 });
    const dispatcher = await createUser({ role: 'admin', adminRole: 'dispatch', phone: null });
    const order = await placeOrder();

    const [first] = await offersOf(near);
    const declined = await api('post', `/deliveries/offers/${first.id}/decline`, near);
    expect(declined.status).toBe(200);
    expect(declined.body.data).toMatchObject({ id: first.id, status: 'declined', orderCode: order.code });
    const [second] = await offersOf(next);
    expect(second.orderId).toBe(order.id);
    expect(await offersOf(near)).toEqual([]);

    // The second rider lets it run out
    await DeliveryOffer.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: second.id } });
    await expireOffer(second.id);
    expect(await DeliveryOffer.findByPk(second.id)).toMatchObject({ status: 'expired' });
    const alerts = () => Notification.count({ where: { userId: dispatcher.id, title: 'No rider for an order' } });
    expect(await alerts()).toBe(1);
    await dispatchOrder(order.id);
    expect(await alerts()).toBe(1);
  });

  it('skips busy riders and riders who already have an offer', async () => {
    const busy = await createRider({ lat: 6.516, lng: 3.38 });
    await assigned(busy);
    const free = await createRider({ lat: 6.55, lng: 3.4 });
    const order = await placeOrder();
    expect(await offersOf(busy)).toEqual([]);
    expect((await offersOf(free))[0].orderId).toBe(order.id);

    // A second ready order waits rather than doubling up on the free rider
    await placeOrder();
    expect(await offersOf(free)).toHaveLength(1);
  });
});

describe('accepting an offer', () => {
  it('assigns the rider, creates the delivery and returns the active delivery', async () => {
    const tunde = await createRider({ lat: 6.516, lng: 3.38 }, { firstName: 'Tunde', lastName: 'Bakare' });
    const order = await placeOrder();
    const [offer] = await offersOf(tunde);

    const res = await api('post', `/deliveries/offers/${offer.id}/accept`, tunde);
    expect(res.status).toBe(200);
    const delivery = await Delivery.findOne({ where: { orderId: order.id } });
    expect(res.body.data).toEqual({
      id: delivery.id,
      orderId: order.id,
      orderCode: order.code,
      status: 'rider_assigned',
      fee: order.deliveryFee,
      earning: Math.round((order.deliveryFee * 70) / 100),
      distanceM: order.distanceM,
      itemCount: 2,
      pickup: {
        name: 'Mama Put Kitchen',
        phone: null,
        address: '1 Herbert Macaulay Way, Yaba',
        lat: 6.5158,
        lng: 3.3794,
      },
      dropoff: {
        name: 'Ada Okafor',
        phone: ada.phone,
        address: '5 Commercial Avenue, Yaba',
        note: '',
        lat: 6.5095,
        lng: 3.3711,
      },
      rider: { lat: 6.516, lng: 3.38 },
      assignedAt: expect.any(String),
      pickedUpAt: null,
    });
    const updated = await Order.findByPk(order.id);
    expect(updated).toMatchObject({ status: 'rider_assigned', riderId: tunde.rider.id });
    expect(updated.statusHistory.at(-1)).toMatchObject({ status: 'rider_assigned', by: 'rider' });
    expect(await DeliveryOffer.findByPk(offer.id)).toMatchObject({ status: 'accepted' });
    expect((await api('get', '/rider/delivery', tunde)).body.data.id).toBe(delivery.id);

    // The customer's order detail carries the rider and the delivery
    const detail = (await api('get', `/orders/${order.id}`, ada)).body.data;
    expect(detail.rider).toMatchObject({ id: tunde.rider.id, name: 'Tunde Bakare' });
    expect(detail.delivery).toMatchObject({ id: delivery.id, status: 'assigned', route: [] });
  });

  it('409 OFFER_GONE once expired, answered or taken; 404 for someone else’s offer', async () => {
    const a = await createRider({ lat: 6.516, lng: 3.38 });
    const b = await createRider({ lat: 6.53, lng: 3.39 });
    await placeOrder();
    const [offer] = await offersOf(a);

    expect((await api('post', `/deliveries/offers/${offer.id}/accept`, b)).status).toBe(404);
    await DeliveryOffer.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: offer.id } });
    const late = await api('post', `/deliveries/offers/${offer.id}/accept`, a);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('OFFER_GONE');

    // Expiry moved it on to b, who takes it; a second accept is gone too
    const [bOffer] = await offersOf(b);
    expect((await api('post', `/deliveries/offers/${bOffer.id}/accept`, b)).status).toBe(200);
    expect((await api('post', `/deliveries/offers/${bOffer.id}/accept`, b)).body.error.code).toBe('OFFER_GONE');
  });
});

describe('pickup and hand-over', () => {
  it('picks up, refuses a wrong code (422 on code), completes with the right one and pays the rider', async () => {
    const tunde = await createRider({ lat: 6.516, lng: 3.38 });
    const { order, delivery } = await assigned(tunde);

    const early = await api('post', `/deliveries/${delivery.id}/complete`, tunde, { code: order.deliveryCode });
    expect(early.status).toBe(409);
    const picked = await api('post', `/deliveries/${delivery.id}/pickup`, tunde);
    expect(picked.status).toBe(200);
    expect(picked.body.data).toMatchObject({ status: 'picked_up', pickedUpAt: expect.any(String) });
    expect((await api('post', `/deliveries/${delivery.id}/pickup`, tunde)).status).toBe(409);

    const wrongCode = order.deliveryCode === '0000' ? '1111' : '0000';
    const wrong = await api('post', `/deliveries/${delivery.id}/complete`, tunde, { code: wrongCode });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.fieldErrors.code).toMatch(/doesn't match/);
    expect((await api('post', `/deliveries/${delivery.id}/complete`, tunde, { code: '12' })).status).toBe(422);

    const done = await api('post', `/deliveries/${delivery.id}/complete`, tunde, { code: order.deliveryCode });
    expect(done.status).toBe(200);
    const earning = Math.round((order.deliveryFee * 70) / 100);
    expect(done.body.data).toEqual({ id: delivery.id, status: 'delivered', earning, orderCode: order.code });
    expect(await Delivery.findByPk(delivery.id)).toMatchObject({
      status: 'delivered',
      riderEarning: earning,
      payoutPct: 70,
    });
    expect(await Order.findByPk(order.id)).toMatchObject({ status: 'delivered' });
    expect((await Rider.findByPk(tunde.rider.id)).tripsCount).toBe(1);
    expect(await Notification.count({ where: { userId: ada.id, title: 'How was your food?' } })).toBe(1);
    expect((await api('get', '/rider/delivery', tunde)).body.data).toBeNull();
  });

  it('another rider’s delivery is a 404', async () => {
    const tunde = await createRider({ lat: 6.516, lng: 3.38 });
    const { delivery } = await assigned(tunde);
    const other = await createRider({ lat: 6.6, lng: 3.5 });
    expect((await api('post', `/deliveries/${delivery.id}/pickup`, other)).status).toBe(404);
    expect((await api('post', `/deliveries/${delivery.id}/pickup`, ada)).status).toBe(403);
  });
});

describe('customer–rider chat', () => {
  it('is open while the rider is on the way, for the customer and the assigned rider only', async () => {
    const tunde = await createRider({ lat: 6.516, lng: 3.38 }, { firstName: 'Tunde' });
    const waiting = await placeOrder();
    expect((await api('get', `/orders/${waiting.id}/chat`, ada)).body.data).toEqual({ isOpen: false, messages: [] });
    const closed = await api('post', `/orders/${waiting.id}/chat`, ada, { body: 'Hello?' });
    expect(closed.status).toBe(409);
    expect((await api('get', `/orders/${waiting.id}/chat`, tunde)).status).toBe(404);

    const [offer] = await offersOf(tunde);
    await api('post', `/deliveries/offers/${offer.id}/accept`, tunde);
    const sent = await api('post', `/orders/${waiting.id}/chat`, ada, { body: '  Please call at the gate  ' });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({
      senderRole: 'customer',
      senderName: 'Ada',
      body: 'Please call at the gate',
    });
    await api('post', `/orders/${waiting.id}/chat`, tunde, { body: 'On my way' });

    const thread = (await api('get', `/orders/${waiting.id}/chat`, tunde)).body.data;
    expect(thread.isOpen).toBe(true);
    expect(thread.messages.map((m) => [m.senderRole, m.body])).toEqual([
      ['customer', 'Please call at the gate'],
      ['rider', 'On my way'],
    ]);
    expect(await Notification.count({ where: { userId: tunde.id, title: 'Message from your customer' } })).toBe(1);

    expect((await api('post', `/orders/${waiting.id}/chat`, ada, { body: '   ' })).status).toBe(422);
    expect((await api('post', `/orders/${waiting.id}/chat`, ada, { body: 'x'.repeat(501) })).status).toBe(422);
    expect((await api('get', `/orders/${waiting.id}/chat`, await createUser())).status).toBe(404);
    expect((await api('get', `/orders/${waiting.id}/chat`, owner)).status).toBe(403);
  });
});

describe('admin dispatch', () => {
  it('POST /admin/orders/{id}/reassign gives the order to another free rider, audited', async () => {
    const first = await createRider({ lat: 6.516, lng: 3.38 }, { firstName: 'Tunde', lastName: 'Bakare' });
    const { order } = await assigned(first);
    const second = await createRider({ lat: 6.53, lng: 3.39 }, { firstName: 'Kemi', lastName: 'Ade' });
    const dispatcher = await createUser({ role: 'admin', adminRole: 'dispatch', phone: null });

    const res = await api('post', `/admin/orders/${order.id}/reassign`, dispatcher, { riderId: second.rider.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: order.id, status: 'rider_assigned', riderId: second.rider.id });
    expect(res.body.data.statusHistory.at(-1)).toMatchObject({ by: 'admin', note: 'Reassigned to Kemi Ade' });
    expect(await Delivery.findOne({ where: { orderId: order.id } })).toMatchObject({ riderId: second.rider.id });
    expect(await AuditLog.findOne({ where: { action: 'order.reassign', targetId: order.id } })).toMatchObject({
      summary: `KJT-${order.code}: Tunde Bakare → Kemi Ade`,
    });
    expect(await Notification.count({ where: { userId: first.id, title: 'Delivery reassigned' } })).toBe(1);
    expect(await Notification.count({ where: { userId: second.id, title: 'New delivery for you' } })).toBe(1);
  });

  it('reassign: 422 for the same, busy or unapproved rider; 409 after pickup', async () => {
    const tunde = await createRider({ lat: 6.516, lng: 3.38 });
    const { order, delivery } = await assigned(tunde);
    const dispatcher = await createUser({ role: 'admin', adminRole: 'dispatch', phone: null });
    const reassign = (riderId) => api('post', `/admin/orders/${order.id}/reassign`, dispatcher, { riderId });

    expect((await reassign(tunde.rider.id)).body.error.fieldErrors.riderId).toBe('This rider already has the order');
    const pending = await createRider({ approvalStatus: 'pending' });
    expect((await reassign(pending.rider.id)).body.error.fieldErrors.riderId).toBe('Pick an approved rider');
    const busy = await createRider({ lat: 6.6, lng: 3.5 });
    await assigned(busy);
    expect((await reassign(busy.rider.id)).body.error.fieldErrors.riderId).toBe('This rider is on another delivery');

    await api('post', `/deliveries/${delivery.id}/pickup`, tunde);
    const free = await createRider({ lat: 6.7, lng: 3.6 });
    const late = await reassign(free.rider.id);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATUS');
  });

  it('GET /admin/live-map shows online riders and active deliveries', async () => {
    const tunde = await createRider({ lat: 6.516, lng: 3.38 }, { firstName: 'Tunde', lastName: 'Bakare' });
    const { order } = await assigned(tunde);
    await createRider({ isOnline: false });
    const dispatcher = await createUser({ role: 'admin', adminRole: 'dispatch', phone: null });

    const res = await api('get', '/admin/live-map', dispatcher);
    expect(res.status).toBe(200);
    expect(res.body.data.riders).toEqual([
      {
        id: tunde.rider.id,
        name: 'Tunde Bakare',
        city: 'Lagos',
        vehicleType: 'motorcycle',
        lat: 6.516,
        lng: 3.38,
        lastSeenAt: expect.any(String),
        orderId: order.id,
      },
    ]);
    expect(res.body.data.deliveries).toEqual([
      {
        orderId: order.id,
        code: order.code,
        status: 'rider_assigned',
        city: 'Lagos',
        riderId: tunde.rider.id,
        vendor: { name: 'Mama Put Kitchen', lat: 6.5158, lng: 3.3794 },
        dropoff: { area: 'Yaba', lat: 6.5095, lng: 3.3711 },
        etaMins: [order.etaMinMins, order.etaMaxMins],
      },
    ]);
    expect(res.body.data.at).toEqual(expect.any(String));
  });

  it('GET /admin/riders?nearOrderId lists free online riders nearest the vendor; rows show isBusy', async () => {
    const busy = await createRider({ lat: 6.5159, lng: 3.3795 });
    await assigned(busy);
    const near = await createRider({ lat: 6.52, lng: 3.38 });
    const far = await createRider({ lat: 6.6, lng: 3.45 });
    await createRider({ isOnline: false });
    const order = await placeOrder({ ready: false });
    const support = await createUser({ role: 'admin', adminRole: 'support', phone: null });

    const res = await api('get', `/admin/riders?nearOrderId=${order.id}`, support);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).toEqual([near.rider.id, far.rider.id]);
    expect(res.body.data[0].distanceM).toBeLessThan(res.body.data[1].distanceM);

    const all = (await api('get', '/admin/riders', support)).body.data;
    expect(all.find((r) => r.id === busy.rider.id).isBusy).toBe(true);
    expect(all.find((r) => r.id === near.rider.id).isBusy).toBe(false);
  });
});
