import { scanSubscriptions } from './subscriptions.service.js';

// Processors for the `subscriptions` queue, by job name. Each is safe to run twice.
export const subscriptionProcessors = {
  'subscriptions.scan': () => scanSubscriptions(),
};
