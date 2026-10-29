// Platform settings (handoff 8.3; same values as the frontend's settings-defaults.js). Money in kobo.
// Used for any key without a row in `settings`, and by the seeder.
export const DEFAULT_SETTINGS = Object.freeze({
  deliveryBaseFee: 50000,
  deliveryPerKm: 15000,
  deliveryMaxFee: 300000,
  processingFeePct: 1.5,
  processingFeeFlat: 10000,
  processingFeeCap: 200000,
  riderPayoutPct: 70,
  vendorAcceptTimeoutSec: 300,
  riderOfferTimeoutSec: 30,
  trialDays: 14,
  graceDays: 3,
  yearlyDiscountPct: 15,
  refundDeadlineHours: 48,
  refundMissedAction: 'escalate',
});

export const DEFAULT_NOTIFICATION_TEMPLATES = Object.freeze([
  {
    key: 'order_paid',
    channel: 'email',
    subject: 'We got your order',
    body: 'Hi {{name}}, your order {{orderNumber}} is with {{vendor}}.',
  },
  {
    key: 'order_on_the_way',
    channel: 'sms',
    subject: '',
    body: 'Your KJT Foodie order is on the way. Delivery code: {{code}}',
  },
  {
    key: 'vendor_new_order',
    channel: 'sms',
    subject: '',
    body: 'New order {{orderNumber}} — {{total}}. Accept within 5 min.',
  },
  {
    key: 'subscription_reminder',
    channel: 'email',
    subject: 'Your plan renews soon',
    body: 'Your {{plan}} plan renews on {{date}}.',
  },
]);
