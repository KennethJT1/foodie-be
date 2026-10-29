import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { redisPrefix } from '../../../src/config/redis.js';
import { addJob, createWorker, getQueue } from '../../../src/core/queue/index.js';
import { notificationProcessors } from '../../../src/modules/notifications/notifications.jobs.js';

// Resolves with the next job the worker finishes (completed or failed for good) with this id
const settled = (worker, jobId) =>
  new Promise((resolve) => {
    worker.on('completed', (job, result) => job.id === jobId && resolve({ state: 'completed', job, result }));
    worker.on('failed', (job, err) => {
      if (job?.id !== jobId) return;
      if (job.attemptsMade >= (job.opts.attempts ?? 1) || err.name === 'UnrecoverableError')
        resolve({ state: 'failed', job, err });
    });
  });

describe('notifications queue', () => {
  const calls = [];
  let flakyFailuresLeft = 1;
  let worker;

  beforeAll(async () => {
    expect(redisPrefix).toBe('kjt:test');
    await getQueue('notifications').obliterate({ force: true });

    worker = createWorker('notifications', {
      ...notificationProcessors,
      // Fails once, then succeeds: proves retries with backoff
      'test.flaky': async (data, job) => {
        calls.push({ at: Date.now(), attempt: job.attemptsMade });
        if (flakyFailuresLeft-- > 0) throw new Error('Termii timed out');
        return { ok: true };
      },
    });
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
    await getQueue('notifications').obliterate({ force: true });
  });

  it('keeps test keys under the test prefix', () => {
    expect(getQueue('notifications').opts.prefix).toBe('kjt:test:bull');
  });

  it('sends an SMS in log mode', async () => {
    const done = settled(worker, 'sms-test-1');
    await addJob(
      'notifications',
      'sms.send',
      { to: '+2348030000001', text: 'Your KJT Foodie code is 123456' },
      { jobId: 'sms-test-1' },
    );
    const { state, result } = await done;
    expect(state).toBe('completed');
    expect(result).toEqual({ sandbox: true });
  });

  it('sends an email in log mode', async () => {
    const done = settled(worker, 'email-test-1');
    await addJob(
      'notifications',
      'email.send',
      { to: 'customer@kjtfoodie.test', subject: 'Hi', text: 'Hello' },
      { jobId: 'email-test-1' },
    );
    expect((await done).result).toEqual({ sandbox: true });
  });

  it('retries a failing job with backoff', async () => {
    const done = settled(worker, 'flaky-1');
    await addJob(
      'notifications',
      'test.flaky',
      {},
      { jobId: 'flaky-1', attempts: 3, backoff: { type: 'fixed', delay: 300 } },
    );
    const { state } = await done;

    expect(state).toBe('completed');
    expect(calls).toHaveLength(2);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(300);
  });

  it('uses the configured retry policy by default', async () => {
    const job = await addJob('notifications', 'sms.send', { to: '+2348030000001', text: 'x' }, { delay: 60_000 });
    expect(job.opts).toMatchObject({ attempts: 5, backoff: { type: 'exponential', delay: 10_000 } });
    await job.remove();
  });

  it('fails an unknown job name at once, without retries', async () => {
    const done = settled(worker, 'unknown-1');
    await addJob('notifications', 'sms.sned', {}, { jobId: 'unknown-1' });
    const { state, job, err } = await done;
    expect(state).toBe('failed');
    expect(err.name).toBe('UnrecoverableError');
    expect(job.attemptsMade).toBe(1);
  });

  it('ignores a duplicate job id', async () => {
    const queue = getQueue('notifications');
    const first = await addJob('notifications', 'sms.send', { to: 'a', text: '1' }, { jobId: 'dup-1', delay: 60_000 });
    const second = await addJob('notifications', 'sms.send', { to: 'b', text: '2' }, { jobId: 'dup-1', delay: 60_000 });
    expect(second.id).toBe(first.id);
    expect((await queue.getJob('dup-1')).data.to).toBe('a');
    await first.remove();
  });
});
