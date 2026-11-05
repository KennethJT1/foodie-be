import { reconcilePayments, settlePayments } from './settlement.service.js';
import { processWebhookEvent } from './webhook.service.js';

// Processors for the `payments` queue, by job name. Each is safe to run twice.
export const paymentProcessors = {
  'webhook.process': (data) => processWebhookEvent(data),
  'payments.settle': () => settlePayments(),
  'payments.reconcile': () => reconcilePayments(),
};
