// Registers repeatable jobs (Backend Architecture, section 6), then exits. Run on every deploy with
// `npm run scheduler`; the worker process runs the jobs. Re-running updates schedules in place.
import { logger } from './config/logger.js';
import { closeRedis } from './config/redis.js';
import { closeQueues, getQueue } from './core/queue/index.js';

// { id, queue, job, pattern } in Africa/Lagos time. Later phases add theirs
// (auth.purgeTokens, subscriptions.scanRenewals, payments.reconcile...).
export const SCHEDULES = [
  // Renewal reminders, period ends (renew or grace) and grace ends (expired, store hidden)
  { id: 'subscriptions-scan', queue: 'subscriptions', job: 'subscriptions.scan', pattern: '5 * * * *' },
  // Order payments: settling → settled after the T+1 window; flag payments with no webhook
  { id: 'payments-settle', queue: 'payments', job: 'payments.settle', pattern: '15 * * * *' },
  { id: 'payments-reconcile', queue: 'payments', job: 'payments.reconcile', pattern: '25 * * * *' },
  // Refund requests past their deadline that the delayed job missed
  { id: 'refunds-sweep', queue: 'refunds', job: 'refunds.sweep', pattern: '35 * * * *' },
  // Rider payout statements for last month: 02:00 on the 1st
  { id: 'payouts-statements', queue: 'payouts', job: 'payouts.statements', pattern: '0 2 1 * *' },
];

const run = async () => {
  for (const { id, queue, job, pattern, data = {} } of SCHEDULES) {
    await getQueue(queue).upsertJobScheduler(id, { pattern, tz: 'Africa/Lagos' }, { name: job, data });
    logger.info(`Scheduled ${queue}/${job} (${pattern})`);
  }
  logger.info(`${SCHEDULES.length} schedules registered`);
};

run()
  .catch((err) => {
    logger.fatal({ err }, 'Scheduler failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueues();
    await closeRedis();
  });
