// Sends Socket.IO events from anywhere: the API process (through its own server) or the worker /
// scheduler (through Redis, picked up by every API instance's Redis adapter).
import { Emitter } from '@socket.io/redis-emitter';
import { logger } from '../config/logger.js';
import { createRedis, redisPrefix } from '../config/redis.js';

// Shared by the adapter and the emitter so both talk on the same Redis channels
export const SOCKET_KEY = `${redisPrefix}:socket.io`;

let localServer = null;
let emitter = null;

/** The API process registers its Socket.IO server here; elsewhere events go through Redis. */
export const setLocalServer = (io) => {
  localServer = io;
};

const getEmitter = () => {
  if (!emitter) {
    const client = createRedis({ name: 'socket-emitter' });
    // The emitter calls publish() without handling the promise; a Redis outage must not surface as
    // an unhandled rejection (events are best effort, the REST API stays the source of truth)
    const safeClient = {
      publish: (channel, message) =>
        client.publish(channel, message).catch((err) => logger.warn({ err: err.message }, 'Socket emit failed')),
    };
    emitter = new Emitter(safeClient, { key: SOCKET_KEY });
  }
  return emitter;
};

/** Emits `event` to everyone in `room`. Never throws. */
export const emitTo = (room, event, payload) => {
  try {
    (localServer ?? getEmitter()).to(room).emit(event, payload);
  } catch (err) {
    logger.warn({ err, room, event }, 'Socket emit failed');
  }
};

/**
 * Emits once the transaction commits (nothing is sent for a rollback). `payload` may be a function,
 * called after commit, for payloads that need a fresh read.
 *
 * Sequelize awaits afterCommit hooks before the caller's transaction resolves, so the send is
 * started and not awaited: a fresh read for the payload never delays the HTTP response.
 */
export const emitAfterCommit = (transaction, room, event, payload) => {
  const send = async () => {
    try {
      emitTo(room, event, typeof payload === 'function' ? await payload() : payload);
    } catch (err) {
      logger.warn({ err, room, event }, 'Socket emit failed');
    }
  };
  if (transaction) {
    transaction.afterCommit(() => {
      void send();
    });
  } else void send();
};
