import { UnrecoverableError, Worker } from 'bullmq';
import { createRedis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { QUEUES } from './definitions.js';
import { bullPrefix } from './queues.js';

/**
 * Builds the processor for one queue: `processors` maps job name → `async (data, job) => result`.
 * An unknown job name can never succeed, so it fails at once instead of retrying.
 */
export const routeJobs = (queueName, processors) => async (job) => {
  const processor = processors[job.name];
  if (!processor) throw new UnrecoverableError(`No processor for ${queueName}/${job.name}`);
  return processor(job.data, job);
};

/** A Worker for `queueName` with its configured concurrency; logs failures with context. */
export const createWorker = (queueName, processors, options = {}) => {
  const definition = QUEUES[queueName];
  if (!definition) throw new Error(`Unknown queue: ${queueName}`);

  const worker = new Worker(queueName, routeJobs(queueName, processors), {
    connection: createRedis({ name: `worker:${queueName}`, forWorker: true }),
    prefix: bullPrefix,
    concurrency: definition.concurrency,
    ...options,
  });

  worker.on('failed', (job, err) => {
    const final = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    logger[final ? 'error' : 'warn'](
      { err, queue: queueName, job: job?.name, jobId: job?.id, attempt: job?.attemptsMade },
      final ? 'Job failed for good' : 'Job failed, will retry',
    );
  });
  worker.on('error', (err) => logger.error({ err, queue: queueName }, 'Worker error'));
  return worker;
};
