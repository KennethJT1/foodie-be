import { generateStatements } from './payouts.service.js';

// Processors for the `payouts` queue, by job name. Each is safe to run twice.
export const payoutProcessors = {
  // 1st of the month: last month's draft statement per rider (unique rider + month)
  'payouts.statements': (data) => generateStatements(data ?? {}),
};
