import { z } from 'zod';
import { TEMPLATE_CHANNELS } from '../../db/models/notificationTemplate.model.js';

// Same bounds and wording as the frontend mock (admin-ops.js NUMBER_RULES)
const number = (min, max, label, { int = false } = {}) => {
  const message = `Enter a ${label} between ${min} and ${max}`;
  const base = z.number({ error: message }).min(min, message).max(max, message);
  return (int ? base.int(message) : base).optional();
};

export const updateSettingsBody = z.object({
  deliveryBaseFee: number(0, 1_000_000, 'base fee', { int: true }),
  deliveryPerKm: number(0, 500_000, 'fee per km', { int: true }),
  deliveryMaxFee: number(0, 5_000_000, 'maximum fee', { int: true }),
  riderPayoutPct: number(0, 100, 'rider payout %'),
  vendorAcceptTimeoutSec: number(60, 1800, 'accept timeout', { int: true }),
  riderOfferTimeoutSec: number(10, 120, 'offer timeout', { int: true }),
  trialDays: number(0, 90, 'trial length', { int: true }),
  graceDays: number(0, 14, 'grace period', { int: true }),
  yearlyDiscountPct: number(0, 50, 'yearly discount'),
  refundDeadlineHours: number(1, 168, 'refund deadline', { int: true }),
  processingFeePct: number(0, 10, 'processing fee %'),
  refundMissedAction: z.enum(['escalate', 'warn', 'suspend'], { error: 'Pick an action' }).optional(),
  serviceAreas: z
    .array(z.string({ error: 'Enter a city name' }), { error: 'Keep at least one city' })
    .transform((names) => [...new Set(names.map((n) => n.trim().slice(0, 40)).filter(Boolean))])
    .refine((names) => names.length > 0, 'Keep at least one city')
    .optional(),
  notificationTemplates: z
    .array(
      z.object({
        key: z.string({ error: 'Unknown template' }),
        channel: z.enum(TEMPLATE_CHANNELS, { error: 'Pick a channel' }),
        subject: z.string().trim().max(120, 'Keep the subject under 120 characters').optional().default(''),
        body: z
          .string({ error: 'Write the message' })
          .trim()
          .min(1, 'Write the message')
          .max(1000, 'Keep the message under 1000 characters'),
      }),
      { error: 'Send the list of templates' },
    )
    .optional(),
});
