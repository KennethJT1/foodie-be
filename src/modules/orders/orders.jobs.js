import { dispatchOrder, expireOffer } from '../deliveries/dispatch.service.js';
import { autoReject } from './orders.service.js';

// Processors for the `dispatch` queue, by job name. Each is safe to run twice.
export const dispatchProcessors = {
  'order.autoReject': ({ orderId }) => autoReject(orderId),
  // Offer a ready order to the next free rider (after a failure, or every minute while nobody takes it)
  'order.dispatch': ({ orderId }) => dispatchOrder(orderId),
  // A job offer ran out: mark it expired and offer the order to the next rider
  'offer.expire': ({ offerId }) => expireOffer(offerId),
};
