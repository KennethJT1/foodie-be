import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { createServer } from 'node:http';
import { io as connectClient } from 'socket.io-client';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { CATEGORIES } from '../../../src/db/seed/data/catalogue.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { emitTo, setLocalServer } from '../../../src/realtime/emit.js';
import { rooms } from '../../../src/realtime/rooms.js';
import { attachRealtime, closeRealtime } from '../../../src/realtime/server.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createFoodItem, createPublicVendor, createUser } from '../../helpers/factories.js';

const { Address, Rider } = models;

let httpServer;
let io;
let url;
const clients = [];

beforeAll(async () => {
  httpServer = createServer(app);
  io = attachRealtime(httpServer, { liveMapMs: 500 });
  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${httpServer.address().port}`;
});

let ada;
let owner;
let vendor;
let dish;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await models.Category.bulkCreate(CATEGORIES);
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
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

afterEach(() => {
  while (clients.length) clients.pop().disconnect();
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

const placeOrder = async (customer = ada) => {
  const address = await Address.findOne({ where: { userId: customer.id } });
  const init = await api('post', '/payments/initialize', customer, {
    vendorId: vendor.id,
    addressId: address.id,
    items: [{ foodItemId: dish.id, quantity: 1 }],
  });
  return (await api('post', '/payments/verify', customer, { reference: init.body.data.reference })).body.data.order;
};

/** Opens a socket like the frontend does; resolves once connected, rejects with the connect error. */
const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = connectClient(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

const connectAs = (user) => connect(bearer(user).slice('Bearer '.length));

const ask = (socket, event, payload) => socket.timeout(10_000).emitWithAck(event, payload);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Records every `event` on `socket` from now on. `nth(i)` waits (up to `ms`, counted from the
 * call, so slow setup before it doesn't eat the time) for the i-th payload. Never rejects early,
 * so nothing goes unhandled while a test awaits other calls.
 */
const listen = (socket, event) => {
  const events = [];
  socket.on(event, (payload) => events.push(payload));
  const nth = async (i = 0, ms = 15_000) => {
    const until = Date.now() + ms;
    while (events.length <= i) {
      if (Date.now() > until) throw new Error(`no ${event} #${i + 1} within ${ms} ms`);
      await sleep(50);
    }
    return events[i];
  };
  return { events, first: (ms) => nth(0, ms), nth };
};

// Inside a describe so it runs before the shared afterAll that closes Redis and the pool
describe('Socket.IO', () => {
  afterAll(() => closeRealtime(io));

  describe('connecting', () => {
    it('refuses a missing or invalid token', async () => {
      await expect(connect(undefined)).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
      await expect(connect('not-a-jwt')).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
    });

    it('refuses banned and suspended accounts', async () => {
      const banned = await createUser({ status: 'banned' });
      await expect(connectAs(banned)).rejects.toMatchObject({
        message: 'ACCOUNT_BANNED',
        data: { code: 'ACCOUNT_BANNED' },
      });
      const suspended = await createUser({ status: 'suspended' });
      await expect(connectAs(suspended)).rejects.toMatchObject({ message: 'ACCOUNT_SUSPENDED' });
    });

    it('accepts a valid token', async () => {
      const socket = await connectAs(ada);
      expect(socket.connected).toBe(true);
    });
  });

  describe('order rooms', () => {
    it('lets the customer, the vendor and admins with orders.view subscribe; anyone else gets NOT_FOUND', async () => {
      const order = await placeOrder();
      const join = async (user) => ask(await connectAs(user), 'order:subscribe', { orderId: order.id });

      expect(await join(ada)).toEqual({ ok: true });
      expect(await join(owner)).toEqual({ ok: true });
      expect(await join(await createUser({ role: 'admin', adminRole: 'support', phone: null }))).toEqual({ ok: true });

      const refused = { ok: false, error: { code: 'NOT_FOUND', message: expect.any(String) } };
      expect(await join(await createUser())).toEqual(refused);
      expect(await join(await createUser({ role: 'admin', adminRole: 'onboarding', phone: null }))).toEqual(refused);
      const { owner: otherOwner } = await createPublicVendor();
      expect(await join(otherOwner)).toEqual(refused);
      expect(await ask(await connectAs(ada), 'order:subscribe', {})).toEqual(refused);
    });

    it('pushes order:status after each committed transition, and stops after unsubscribe', async () => {
      const order = await placeOrder();
      const socket = await connectAs(ada);
      await ask(socket, 'order:subscribe', { orderId: order.id });

      const statuses = listen(socket, 'order:status');
      expect((await api('post', `/orders/${order.id}/accept`, owner)).status).toBe(200);
      const payload = await statuses.first();
      expect(payload).toEqual({
        orderId: order.id,
        status: 'accepted',
        statusHistory: [
          expect.objectContaining({ status: 'paid' }),
          expect.objectContaining({ status: 'accepted', by: 'vendor' }),
        ],
        updatedAt: expect.stringMatching(/Z$/),
      });

      expect(await ask(socket, 'order:unsubscribe', { orderId: order.id })).toEqual({ ok: true });
      const later = listen(socket, 'order:status');
      expect((await api('post', `/orders/${order.id}/preparing`, owner)).status).toBe(200);
      await sleep(1500);
      expect(later.events).toEqual([]);
    });

    it('sends nothing for a refused change (no commit)', async () => {
      const order = await placeOrder();
      const socket = await connectAs(ada);
      await ask(socket, 'order:subscribe', { orderId: order.id });
      const statuses = listen(socket, 'order:status');
      // Not accepted yet, so "ready" is refused
      expect((await api('post', `/orders/${order.id}/ready`, owner)).status).toBe(409);
      await sleep(1500);
      expect(statuses.events).toEqual([]);
    });
  });

  describe('vendor rooms', () => {
    it('only the store owner may subscribe', async () => {
      expect(await ask(await connectAs(owner), 'vendor:subscribe', { vendorId: vendor.id })).toEqual({ ok: true });
      const { owner: otherOwner } = await createPublicVendor();
      expect(await ask(await connectAs(otherOwner), 'vendor:subscribe', { vendorId: vendor.id })).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(await ask(await connectAs(ada), 'vendor:subscribe', { vendorId: vendor.id })).toMatchObject({ ok: false });
    });

    it('pushes vendor:order:new when a paid order arrives', async () => {
      const socket = await connectAs(owner);
      await ask(socket, 'vendor:subscribe', { vendorId: vendor.id });
      const arrived = listen(socket, 'vendor:order:new');
      const order = await placeOrder();
      expect(await arrived.first()).toEqual({
        vendorId: vendor.id,
        orderId: order.id,
        code: order.code,
        total: order.total,
        acceptDeadline: order.acceptDeadline,
      });
    });
  });

  describe('notification:new', () => {
    it('pushes new in-app notifications to the user’s sockets', async () => {
      const socket = await connectAs(ada);
      const pushed = listen(socket, 'notification:new');
      await placeOrder();
      expect(await pushed.first()).toMatchObject({ type: 'order', title: 'We got your order', readAt: null });
    });
  });

  describe('events from the worker', () => {
    it('reach sockets through Redis when this process has no Socket.IO server', async () => {
      const socket = await connectAs(ada);
      const pushed = listen(socket, 'notification:new');
      setLocalServer(null);
      try {
        emitTo(rooms.user(ada.id), 'notification:new', { id: 'from-worker' });
        expect(await pushed.first()).toEqual({ id: 'from-worker' });
      } finally {
        setLocalServer(io);
      }
    });
  });

  describe('riders and the live map (phase 17)', () => {
    const createRider = async (rider = {}) => {
      const user = await createUser({
        role: 'rider',
        rider: {
          approvalStatus: 'approved',
          vehicleType: 'motorcycle',
          city: 'Lagos',
          isOnline: true,
          lat: 6.516,
          lng: 3.38,
          ...rider,
        },
      });
      user.rider = await Rider.findOne({ where: { userId: user.id } });
      return user;
    };

    /** A paid order taken to ready_for_pickup by the vendor (dispatch runs on ready). */
    const readyOrder = async () => {
      const order = await placeOrder();
      for (const step of ['accept', 'preparing', 'ready']) await api('post', `/orders/${order.id}/${step}`, owner);
      return order;
    };

    it('only the rider may join their room; job offers arrive there', async () => {
      const tunde = await createRider();
      const other = await createRider({ lat: 6.6, lng: 3.5 });
      const socket = await connectAs(tunde);
      expect(await ask(socket, 'rider:subscribe', { riderId: tunde.rider.id })).toEqual({ ok: true });
      expect(await ask(await connectAs(other), 'rider:subscribe', { riderId: tunde.rider.id })).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });

      const offered = listen(socket, 'rider:job:offer');
      const order = await readyOrder();
      expect(await offered.first()).toMatchObject({
        orderId: order.id,
        orderCode: order.code,
        riderId: tunde.rider.id,
        status: 'pending',
      });
    });

    it('rider:location is stored and, during a delivery, forwarded to the order room with an ETA', async () => {
      const tunde = await createRider();
      const order = await readyOrder();
      const [offer] = (await api('get', '/rider/offers', tunde)).body.data;
      await api('post', `/deliveries/offers/${offer.id}/accept`, tunde);

      const customer = await connectAs(ada);
      await ask(customer, 'order:subscribe', { orderId: order.id });
      const forwarded = listen(customer, 'rider:location');
      const riderSocket = await connectAs(tunde);
      const ack = await ask(riderSocket, 'rider:location', {
        riderId: tunde.rider.id,
        lat: 6.517,
        lng: 3.381,
        heading: 91.6,
      });
      expect(ack).toEqual({ ok: true });
      expect(await forwarded.first()).toEqual({
        orderId: order.id,
        riderId: tunde.rider.id,
        lat: 6.517,
        lng: 3.381,
        heading: 92,
        etaMins: [expect.any(Number), expect.any(Number)],
        at: expect.any(String),
      });
      expect(await Rider.findByPk(tunde.rider.id)).toMatchObject({ lat: 6.517, lng: 3.381 });
      const route = (await models.Delivery.findOne({ where: { orderId: order.id } })).route;
      expect(route).toEqual([{ lat: 6.517, lng: 3.381, at: expect.any(String) }]);

      // Bad input, another rider's id and an offline rider are refused
      expect(await ask(riderSocket, 'rider:location', { lat: 'x' })).toMatchObject({ ok: false });
      const other = await createRider({ lat: 6.6, lng: 3.5 });
      expect(await ask(riderSocket, 'rider:location', { riderId: other.rider.id, lat: 6.5, lng: 3.3 })).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      const offline = await createRider({ isOnline: false });
      expect(await ask(await connectAs(offline), 'rider:location', { lat: 6.5, lng: 3.3 })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_STATUS' },
      });
    });

    it('admin:live-map needs live_map.view; subscribers get a snapshot now and then every few seconds', async () => {
      await createRider();
      const support = await createUser({ role: 'admin', adminRole: 'support', phone: null });
      expect(await ask(await connectAs(support), 'admin:live-map:subscribe')).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });

      const dispatcher = await createUser({ role: 'admin', adminRole: 'dispatch', phone: null });
      const socket = await connectAs(dispatcher);
      const maps = listen(socket, 'admin:live-map');
      expect(await ask(socket, 'admin:live-map:subscribe')).toEqual({ ok: true });
      expect(await maps.first()).toMatchObject({
        riders: [expect.objectContaining({ city: 'Lagos' })],
        deliveries: [],
      });
      // Then the periodic push
      expect(await maps.nth(1)).toMatchObject({ at: expect.any(String) });

      expect(await ask(socket, 'admin:live-map:unsubscribe')).toEqual({ ok: true });
      // A push already being built may still land; after that, nothing
      await sleep(2000);
      const count = maps.events.length;
      await sleep(2000);
      expect(maps.events).toHaveLength(count);
    });
  });
});
