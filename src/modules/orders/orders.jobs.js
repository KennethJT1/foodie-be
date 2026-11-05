import { autoReject } from './orders.service.js';

// Processors for the `dispatch` queue, by job name. Each is safe to run twice.
export const dispatchProcessors = {
  'order.autoReject': ({ orderId }) => autoReject(orderId),
};
