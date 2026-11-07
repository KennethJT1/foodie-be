// Socket.IO on the API's HTTP server (handoff section 5, build plan phase 16).
//
// Clients connect with `io(url, { auth: { token: accessToken }, transports: ['websocket'] })`; an
// invalid or expired token is refused (`connect_error`, message UNAUTHENTICATED) and the client
// reconnects with a fresh token after a refresh. Each socket joins `user:{id}`; other rooms are
// joined on request after a check:
//
//   order:subscribe / order:unsubscribe   { orderId }   customer, its vendor, its rider, admin with orders.view
//   vendor:subscribe / vendor:unsubscribe { vendorId }  the store's owner
//
// Every subscribe accepts an acknowledgement callback: { ok: true } or { ok: false, error: { code, message } }.
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createRedis } from '../config/redis.js';
import { userFromAccessToken } from '../core/middlewares/auth.js';
import { models } from '../db/index.js';
import { orderScope } from '../modules/orders/orders.service.js';
import { SOCKET_KEY, setLocalServer } from './emit.js';
import { rooms } from './rooms.js';

const NOT_FOUND = { code: 'NOT_FOUND', message: "We couldn't find that." };

/** Join checks: resolve true when `user` may join the room for `id`. */
const CAN_JOIN = {
  order: async (user, orderId) => {
    const scope = await orderScope(user).catch(() => null);
    return Boolean(scope && (await models.Order.count({ where: { id: orderId, ...scope } })));
  },
  vendor: async (user, vendorId) =>
    user.role === 'vendor' && Boolean(await models.Vendor.count({ where: { id: vendorId, ownerUserId: user.id } })),
};

/** `order:subscribe` + `order:unsubscribe` style handlers for one room kind. */
const subscription = (socket, kind, idField) => {
  socket.on(`${kind}:subscribe`, async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const id = payload?.[idField];
    try {
      if (typeof id !== 'string' || !id || !(await CAN_JOIN[kind](socket.data.user, id)))
        return reply({ ok: false, error: NOT_FOUND });
      await socket.join(rooms[kind](id));
      reply({ ok: true });
    } catch (err) {
      logger.error({ err, kind, id }, 'Socket subscribe failed');
      reply({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
    }
  });
  socket.on(`${kind}:unsubscribe`, async (payload, ack) => {
    const id = payload?.[idField];
    if (typeof id === 'string') await socket.leave(rooms[kind](id));
    if (typeof ack === 'function') ack({ ok: true });
  });
};

/** Starts Socket.IO on `httpServer`. Returns the server; close it with `closeRealtime(io)`. */
export const attachRealtime = (httpServer) => {
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
  });

  setLocalServer(io);
  return io;
};

/** Disconnects every socket and stops the server (graceful shutdown, tests). */
export const closeRealtime = async (io) => {
  setLocalServer(null);
  await new Promise((resolve) => io.close(() => resolve()));
};
