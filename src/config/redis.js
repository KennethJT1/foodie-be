import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// Every key this app writes starts with this, e.g. kjt:development:bull:notifications:...
export const redisPrefix = env.REDIS_KEY_PREFIX ?? `kjt:${env.NODE_ENV}`;

const connections = new Set();

/**
 * New ioredis connection. BullMQ workers need `maxRetriesPerRequest: null` (blocking commands
 * must wait through reconnects); everything else fails fast so a Redis outage can't hang a request.
 * Connections open on first use, so importing the app never needs Redis.
 */
export const createRedis = ({ name = 'app', forWorker = false } = {}) => {
  const client = new Redis(env.REDIS_URL, {
    connectionName: `kjt-${name}`,
    lazyConnect: true,
    maxRetriesPerRequest: forWorker ? null : 2,
    enableOfflineQueue: true,
  });
  client.on('error', (err) => logger.warn({ err: err.message, connection: name }, 'Redis error'));
  connections.add(client);
  client.once('end', () => connections.delete(client));
  return client;
};

// Shared connection for rate limits, caches and readiness checks
export const redis = createRedis();

/** Closes every connection opened through createRedis (graceful shutdown, tests). */
export const closeRedis = async () => {
  await Promise.all(
    [...connections].map((client) =>
      // Never connected (lazy): nothing to flush, and quit() would connect first
      client.status === 'wait' ? client.disconnect() : client.quit().catch(() => client.disconnect()),
    ),
  );
};
