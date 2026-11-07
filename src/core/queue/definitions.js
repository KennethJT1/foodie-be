// Queues and their retry policy (Backend Architecture, section 6). Later phases add theirs here.
export const QUEUES = {
  notifications: {
    concurrency: 20,
    jobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
  },
  payments: {
    concurrency: 5,
    jobOptions: { attempts: 8, backoff: { type: 'exponential', delay: 30_000 } },
  },
  // Order timers: accept deadline, rider offers and dispatch retries
  dispatch: {
    concurrency: 10,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
  },
  subscriptions: {
    concurrency: 5,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
  },
  // Refund deadlines (refundMissedAction)
  refunds: {
    concurrency: 5,
    jobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 30_000 } },
  },
  // Monthly rider payout statements
  payouts: {
    concurrency: 1,
    jobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },
  },
};

// Kept around for Bull Board and debugging, then trimmed
export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};
