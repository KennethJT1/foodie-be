// Socket.IO on the API's HTTP server (handoff section 5, build plan phase 16).
//
// Clients connect with `io(url, { auth: { token: accessToken }, transports: ['websocket'] })`; an
// invalid or expired token is refused (`connect_error`, message UNAUTHENTICATED) and the client
// reconnects with a fresh token after a refresh. Each socket joins `user:{id}`; other rooms are
// joined on request after a check:
//
//   order:subscribe / order:unsubscribe        { orderId }   customer, its vendor, its rider, admin with orders.view
//   vendor:subscribe / vendor:unsubscribe      { vendorId }  the store's owner
//   rider:subscribe / rider:unsubscribe        { riderId }   that rider (job offers arrive here)
//   admin:live-map:subscribe / :unsubscribe    —             admins with live_map.view; a snapshot is
//                                                            pushed as `admin:live-map` every few seconds
//
// The rider app also sends `rider:location` { riderId, lat, lng, heading } while online.
// Every subscribe (and rider:location) accepts an acknowledgement callback: { ok: true } or
// { ok: false, error: { code, message } }.
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createRedis } from '../config/redis.js';
import { permissionsFor } from '../core/auth/index.js';
import { userFromAccessToken } from '../core/middlewares/auth.js';
import { models } from '../db/index.js';
import { liveMapSnapshot } from '../modules/deliveries/adminDispatch.service.js';
import { recordLocation } from '../modules/deliveries/deliveries.service.js';
import { orderScope } from '../modules/orders/orders.service.js';
import { SOCKET_KEY, setLocalServer } from './emit.js';
import { rooms } from './rooms.js';

const NOT_FOUND = { code: 'NOT_FOUND', message: "We couldn't find that." };
const FAILED = { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
const LIVE_MAP_MS = 5000;

const replier = (ack) => (typeof ack === 'function' ? ack : () => {});

/** Join checks: resolve true when `user` may join the room for `id`. */
const CAN_JOIN = {
  order: async (user, orderId) => {
    const scope = await orderScope(user).catch(() => null);
    return Boolean(scope && (await models.Order.count({ where: { id: orderId, ...scope } })));
  },
  vendor: async (user, vendorId) =>
    user.role === 'vendor' && Boolean(await models.Vendor.count({ where: { id: vendorId, ownerUserId: user.id } })),
  rider: async (user, riderId) =>
    user.role === 'rider' && Boolean(await models.Rider.count({ where: { id: riderId, userId: user.id } })),
};

/** `order:subscribe` + `order:unsubscribe` style handlers for one room kind. */
const subscription = (socket, kind, idField) => {
  socket.on(`${kind}:subscribe`, async (payload, ack) => {
    const reply = replier(ack);
    const id = payload?.[idField];
    try {
      if (typeof id !== 'string' || !id || !(await CAN_JOIN[kind](socket.data.user, id)))
        return reply({ ok: false, error: NOT_FOUND });
      await socket.join(rooms[kind](id));
      reply({ ok: true });
    } catch (err) {
      logger.error({ err, kind, id }, 'Socket subscribe failed');
      reply({ ok: false, error: FAILED });
    }
  });
  socket.on(`${kind}:unsubscribe`, async (payload, ack) => {
    const id = payload?.[idField];
    if (typeof id === 'string') await socket.leave(rooms[kind](id));
    if (typeof ack === 'function') ack({ ok: true });
  });
};

/** The admin live map: a snapshot on subscribe, then the periodic push (see startLiveMap). */
const liveMap = (socket) => {
  socket.on('admin:live-map:subscribe', async (payload, ack) => {
    const reply = replier(typeof payload === 'function' ? payload : ack);
    try {
      const user = socket.data.user;
      if (user.role !== 'admin' || !(await permissionsFor(user)).includes('live_map.view')) {
        return reply({ ok: false, error: { code: 'FORBIDDEN', message: "You don't have access to the live map." } });
      }
      await socket.join(rooms.adminLiveMap);
      reply({ ok: true });
      socket.emit('admin:live-map', await liveMapSnapshot());
    } catch (err) {
      logger.error({ err }, 'Live map subscribe failed');
      reply({ ok: false, error: FAILED });
    }
  });
  socket.on('admin:live-map:unsubscribe', async (payload, ack) => {
    await socket.leave(rooms.adminLiveMap);
    replier(typeof payload === 'function' ? payload : ack)({ ok: true });
  });
};

/**
 * Every `ms`, pushes a snapshot to this instance's live-map sockets (io.local: each API instance
 * serves its own sockets, so nobody gets it twice). Skips the query when nobody is watching here.
 */
const startLiveMap = (io, ms) => {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || !io.of('/').adapter.rooms.get(rooms.adminLiveMap)?.size) return;
    busy = true;
    try {
      io.local.to(rooms.adminLiveMap).emit('admin:live-map', await liveMapSnapshot());
    } catch (err) {
      logger.warn({ err }, 'Live map push failed');
    } finally {
      busy = false;
    }
  }, ms);
  timer.unref();
  return timer;
};

const timers = new WeakMap();

/**
 * Starts Socket.IO on `httpServer`. Returns the server; close it with `closeRealtime(io)`.
 * `liveMapMs` sets how often the live map is pushed.
 */
export const attachRealtime = (httpServer, { liveMapMs = LIVE_MAP_MS } = {}) => {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: env.CORS_ORIGINS, credentials: true },
  });

  // Several API instances (and the worker's emitter) share events through Redis
  const pub = createRedis({ name: 'socket-pub' });
  const sub = createRedis({ name: 'socket-sub' });
  io.adapter(createAdapter(pub, sub, { key: SOCKET_KEY }));

  io.use(async (socket, next) => {
    try {
      socket.data.user = await userFromAccessToken(socket.handshake.auth?.token);
      next();
    } catch (err) {
      const code = err.code ?? 'UNAUTHENTICATED';
      next(Object.assign(new Error(code), { data: { code } }));
    }
  });

  io.on('connection', (socket) => {
    socket.join(rooms.user(socket.data.user.id));
    subscription(socket, 'order', 'orderId');
    subscription(socket, 'vendor', 'vendorId');
    subscription(socket, 'rider', 'riderId');
    liveMap(socket);
    socket.on('rider:location', async (payload, ack) => {
      const reply = replier(ack);
      try {
        reply(await recordLocation(socket.data.user, payload));
      } catch (err) {
        logger.error({ err }, 'rider:location failed');
        reply({ ok: false, error: FAILED });
      }
    });
  });

  timers.set(io, startLiveMap(io, liveMapMs));
  setLocalServer(io);
  return io;
};

/** Disconnects every socket and stops the server (graceful shutdown, tests). */
export const closeRealtime = async (io) => {
  clearInterval(timers.get(io));
  setLocalServer(null);
  await new Promise((resolve) => io.close(() => resolve()));
};
