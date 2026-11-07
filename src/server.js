import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeRedis } from './config/redis.js';
import app from './app.js';
import { closeQueues } from './core/queue/index.js';
import { connectDatabase, sequelize } from './db/index.js';
import './integrations/cloudinary/cloudinary.client.js';
import { attachRealtime } from './realtime/server.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const start = async () => {
  await connectDatabase();
  logger.info(`MySQL connected (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME})`);

  // REST and Socket.IO share one HTTP server and port (handoff section 1)
  const server = createServer(app);
  const io = attachRealtime(server);
  server.listen(env.PORT, () => {
    logger.info(`KJT Foodie API and Socket.IO listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);

    // Force exit if open connections do not drain in time
    setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    // Disconnect sockets, stop accepting new requests, let in-flight ones finish, then close Redis
    // and the DB pool (io.close also closes the HTTP server)
    io.close(async () => {
      await closeQueues();
      await closeRedis();
      await sequelize.close();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    server.closeIdleConnections();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
