// POST /webhooks/paystack (Backend Architecture, section 8): check the signature over the raw body,
// store the event once, answer 200 at once and let the worker do the work.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { UnauthenticatedError } from '../../core/errors/index.js';
import { addJob, jobId } from '../../core/queue/index.js';
import { models } from '../../db/index.js';
import { confirmSubscriptionPayment } from '../subscriptions/subscriptions.service.js';

const { PaymentEvent, Payment } = models;

/** `x-paystack-signature` is HMAC-SHA512 of the raw body with the secret key. */
export const isValidSignature = (rawBody, signature) => {
  if (!env.PAYSTACK_SECRET_KEY || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const given = String(signature);
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

/** Stores a verified event (retries of the same event are ignored) and queues it. */
export const receiveWebhook = async (rawBody, signature) => {
  if (!isValidSignature(rawBody, signature)) {
    logger.warn('Paystack webhook with a bad signature');
    throw new UnauthenticatedError();
  }
  const payload = JSON.parse(rawBody.toString('utf8'));
  const data = payload.data ?? {};
  const eventId = `${payload.event}:${data.id ?? data.reference ?? data.subscription_code ?? 'none'}`;

  const [event, created] = await PaymentEvent.findOrCreate({
    where: { eventId },
    defaults: { eventType: String(payload.event), reference: data.reference ?? null, payload },
  });
  if (created) {
    await addJob('payments', 'webhook.process', { eventId: event.id }, { jobId: jobId('webhook', event.id) });
  }
  return { received: true };
};

/**
 * Worker: handles one stored event. `charge.success` for a plan payment activates it (the same
 * idempotent path as POST /vendor/subscription/verify); order payments join in phase 15.
 */
export const processWebhookEvent = async ({ eventId }) => {
  const event = await PaymentEvent.findByPk(eventId);
  if (!event || event.processedAt) return { skipped: true };
  try {
    if (event.eventType === 'charge.success' && event.reference) {
      const payment = await Payment.findOne({ where: { reference: event.reference } });
      if (payment?.type === 'subscription') await confirmSubscriptionPayment(event.reference);
    }
    await event.update({ processedAt: new Date(), error: null });
    return { processed: event.eventType };
  } catch (err) {
    await event.update({ error: String(err.message).slice(0, 500) });
    throw err;
  }
};
