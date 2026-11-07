import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// Every key this app writes starts with this, e.g. kjt:development:bull:notifications:...
export const redisPrefix = env.REDIS_KEY_PREFIX ?? `kjt:${env.NODE_ENV}`;

const connections = new Set();

// A managed Redis may drop a connection without the client noticing; a command sent on it would
// then wait until the OS gives up on the socket (minutes). Keepalive probes find dead sockets; on
// non-worker connections a command with no reply in SOCKET_TIMEOUT_MS destroys the socket (ioredis
// reconnects and retries), and a command still unanswered after COMMAND_TIMEOUT_MS fails, so a
// Redis problem can't hang a request. Workers wait in blocking commands, so they get neither.
const KEEPALIVE_MS = 10_000;
const SOCKET_TIMEOUT_MS = 8_000;
const COMMAND_TIMEOUT_MS = 20_000;
const QUIT_TIMEOUT_MS = 3_000;

/**
 * New ioredis connection. BullMQ workers need `maxRetriesPerRequest: null` and no command timeout
 * (blocking commands must wait through reconnects); everything else fails fast so a Redis outage
 * can't hang a request. Connections open on first use, so importing the app never needs Redis.
 */
export const createRedis = ({ name = 'app', forWorker = false } = {}) => {
  const client = new Redis(env.REDIS_URL, {
    connectionName: `kjt-${name}`,
    lazyConnect: true,
    maxRetriesPerRequest: forWorker ? null : 2,
    enableOfflineQueue: true,
    keepAlive: KEEPALIVE_MS,
    ...(!forWorker && { socketTimeout: SOCKET_TIMEOUT_MS, commandTimeout: COMMAND_TIMEOUT_MS }),
  });
  client.on('error', (err) => logger.warn({ err: err.message, connection: name }, 'Redis error'));
  connections.add(client);
  client.once('end', () => connections.delete(client));
  return client;
};

// Shared connection for rate limits, caches and readiness checks
export const redis = createRedis();

/** QUIT, or drop the socket if Redis doesn't answer in time (a dead connection never would). */
const quit = (client) =>
  Promise.race([
    client.quit(),
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('QUIT timed out')), QUIT_TIMEOUT_MS).unref()),
  ]).catch(() => client.disconnect());

/** Closes every connection opened through createRedis (graceful shutdown, tests). */
export const closeRedis = async () => {
  await Promise.all(
    [...connections].map((client) =>
      // Never connected (lazy): nothing to flush, and quit() would connect first
      client.status === 'wait' ? client.disconnect() : quit(client),
    ),
  );
};
