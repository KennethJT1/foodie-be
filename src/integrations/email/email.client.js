import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const live = env.NODE_ENV === 'production';

/**
 * Sends one email. Outside production it is logged only. The production provider is not chosen
 * yet (see BACKEND-PROGRESS.md), so production fails loudly rather than dropping mail silently.
 * @returns {Promise<{ sandbox: boolean }>}
 */
export const sendEmail = async ({ to, subject, text }) => {
  if (!live) {
    logger.info({ to, subject, text, from: env.EMAIL_FROM }, 'Email (log mode, not sent)');
    return { sandbox: true };
  }
  throw new Error('No email provider is configured for production');
};
