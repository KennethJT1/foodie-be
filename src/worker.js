// Worker process: runs every queue's jobs. Start with `npm run worker` (separate from the API).
import { logger } from './config/logger.js';
import { closeRedis } from './config/redis.js';
import { closeQueues, createWorker } from './core/queue/index.js';
import { connectDatabase, sequelize } from './db/index.js';
import { notificationProcessors } from './modules/notifications/notifications.jobs.js';

// Queue name → processors by job name. Each phase registers its queue here.
const PROCESSORS = {
  notifications: notificationProcessors,
};

const SHUTDOWN_TIMEOUT_MS = 30_000;

const start = async () => {
  await connectDatabase();
  const workers = Object.entries(PROCESSORS).map(([queue, processors]) => createWorker(queue, processors));
  logger.info(`Worker started: ${Object.keys(PROCESSORS).join(', ')}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, finishing current jobs`);
    setTimeout(() => {
      logger.error('Worker shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    // close() waits for running jobs; unfinished ones are picked up again after restart
    await Promise.all(workers.map((worker) => worker.close()));
    await closeQueues();
    await closeRedis();
    await sequelize.close();
    logger.info('Worker stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
