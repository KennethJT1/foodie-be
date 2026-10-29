import { Queue } from 'bullmq';
import { createRedis, redisPrefix } from '../../config/redis.js';
import { DEFAULT_JOB_OPTIONS, QUEUES } from './definitions.js';

// BullMQ keys live under <prefix>:bull, e.g. kjt:production:bull:notifications:*
export const bullPrefix = `${redisPrefix}:bull`;

const queues = new Map();
let connection;

/** The producer-side Queue for `name`, created on first use. */
export const getQueue = (name) => {
  const definition = QUEUES[name];
  if (!definition) throw new Error(`Unknown queue: ${name}`);

  if (!queues.has(name)) {
    connection ??= createRedis({ name: 'queues' });
    queues.set(
      name,
      new Queue(name, {
        connection,
        prefix: bullPrefix,
        defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...definition.jobOptions },
      }),
    );
  }
  return queues.get(name);
};

/**
 * Custom job id from parts: jobId('autoReject', orderId) → "autoReject-<orderId>".
 * BullMQ does not allow ":" in custom ids.
 */
export const jobId = (...parts) => parts.join('-');

/**
 * Adds a job. Jobs carry IDs and small values only; processors reload fresh data.
 * Pass `jobId` for anything that must not run twice (BullMQ ignores a duplicate id).
 */
export const addJob = (queueName, jobName, data, options) => getQueue(queueName).add(jobName, data, options);

export const closeQueues = async () => {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
  // closeRedis() may close it next; a later getQueue() must open a fresh one
  connection = undefined;
};
