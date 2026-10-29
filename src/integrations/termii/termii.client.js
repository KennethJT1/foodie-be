import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Real SMS only in production; dev, test and staging log the message (demo OTP is 123456)
const live = env.NODE_ENV === 'production';

/**
 * Sends one SMS through Termii. Throws on failure so the notifications job retries.
 * @returns {Promise<{ sandbox: boolean, messageId?: string }>}
 */
export const sendSms = async ({ to, text }) => {
  if (!live) {
    logger.info({ to, text }, 'SMS (log mode, not sent)');
    return { sandbox: true };
  }
  if (!env.TERMII_API_KEY) throw new Error('TERMII_API_KEY is not set');

  const res = await fetch(`${env.TERMII_BASE_URL}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: env.TERMII_API_KEY,
      to: to.replace(/^\+/, ''),
      from: env.TERMII_SENDER_ID,
      sms: text,
      type: 'plain',
      channel: 'generic',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Termii ${res.status}: ${body.message ?? 'send failed'}`);
  return { sandbox: false, messageId: body.message_id };
};
