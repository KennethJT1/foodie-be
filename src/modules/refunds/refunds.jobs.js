import { handleMissedDeadline, sweepMissedDeadlines } from './refunds.service.js';

// Processors for the `refunds` queue, by job name. Each is safe to run twice.
export const refundProcessors = {
  // A request still unanswered at its deadline gets refundMissedAction
  'refund.deadline': ({ refundId }) => handleMissedDeadline(refundId),
  // Hourly: deadlines the delayed jobs missed (worker down, Redis flushed)
  'refunds.sweep': () => sweepMissedDeadlines(),
};
