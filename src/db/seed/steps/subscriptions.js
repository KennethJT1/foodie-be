// Subscriptions for every vendor with a plan status (handoff 8.4): Mama Put on Pro monthly renewing
// in 9 days, Chidi Grills expired, the rest as the vendors step picked (60% active, 20% trial, 10%
// grace, 10% expired). Monthly ⅔, yearly ⅓; 1–6 past monthly invoices (1 for yearly), the latest
// failed for grace vendors; each invoice has a matching subscription payment.
import { Op } from 'sequelize';
import { DEFAULT_SETTINGS } from '../../../modules/settings/settings.defaults.js';
import { models, newId } from '../../index.js';
import { PLANS } from '../data/reference.js';

const { Vendor, Subscription, SubscriptionInvoice, Payment } = models;
const DAY = 24 * 60 * 60 * 1000;

const priceOf = (plan, interval) =>
  interval === 'yearly'
    ? Math.round(plan.monthlyPrice * 12 * (1 - DEFAULT_SETTINGS.yearlyDiscountPct / 100))
    : plan.monthlyPrice;

export const subscriptions = async ({ transaction, faker, now }) => {
  const vendors = await Vendor.findAll({
    where: { subscriptionStatus: { [Op.ne]: 'none' } },
    order: [['id', 'ASC']],
    transaction,
  });
  const plans = new Map(PLANS.map((p) => [p.id, p]));
  const subs = [];
  const invoices = [];
  const payments = [];

  for (const v of vendors) {
    const status = v.subscriptionStatus;
    let interval = faker.helpers.arrayElement(['monthly', 'monthly', 'yearly']);
    let periodEnd;
    if (status === 'expired') periodEnd = now - faker.number.int({ min: 2, max: 20 }) * DAY;
    else if (status === 'grace') periodEnd = now - DAY;
    else if (status === 'trial') periodEnd = now + faker.number.int({ min: 1, max: 13 }) * DAY;
    else periodEnd = now + faker.number.int({ min: 3, max: interval === 'yearly' ? 300 : 28 }) * DAY;
    if (status === 'trial') interval = 'monthly';
    if (v.id === 'ven_mama_put') {
      interval = 'monthly';
      periodEnd = now + 9 * DAY;
    }
    const periodStart = periodEnd - (interval === 'yearly' ? 365 : status === 'trial' ? 14 : 30) * DAY;
    const sub = {
      id: `sub_${v.id.replace(/^ven_/, '')}`,
      vendorId: v.id,
      planId: v.planId,
      interval,
      status,
      currentPeriodStart: new Date(periodStart),
      currentPeriodEnd: new Date(periodEnd),
      trialEndsAt: status === 'trial' ? new Date(periodEnd) : null,
      // Failed renewal yesterday, 2 days of grace left
      graceEndsAt: status === 'grace' ? new Date(now + 2 * DAY) : null,
      createdAt: v.approvedAt ?? v.createdAt,
    };
    subs.push(sub);
    if (status === 'trial') continue;

    const plan = plans.get(v.planId);
    const amount = priceOf(plan, interval);
    const count = interval === 'yearly' ? 1 : faker.number.int({ min: 1, max: 6 });
    for (let k = 0; k < count; k += 1) {
      const at = new Date(periodStart - k * 30 * DAY);
      const reference = `SUB_${faker.string.alphanumeric({ length: 12, casing: 'upper' })}`;
      const failed = status === 'grace' && k === 0;
      invoices.push({
        id: newId(),
        vendorId: v.id,
        subscriptionId: sub.id,
        planId: v.planId,
        interval,
        amount,
        status: failed ? 'failed' : 'paid',
        reference,
        periodStart: failed ? null : at,
        periodEnd: failed ? null : new Date(at.getTime() + (interval === 'yearly' ? 365 : 30) * DAY),
        createdAt: failed ? new Date(periodEnd) : at,
      });
      payments.push({
        reference,
        type: 'subscription',
        userId: v.ownerUserId,
        vendorId: v.id,
        amount,
        vendorShare: 0,
        platformShare: amount,
        fee: Math.round(amount * 0.015),
        channel: 'card',
        status: failed ? 'failed' : 'success',
        settlementStatus: failed ? null : 'settled',
        reconciled: true,
        metadata: { planId: v.planId, interval, kind: k === count - 1 ? 'new' : 'renewal' },
        paidAt: failed ? null : at,
        createdAt: failed ? new Date(periodEnd) : at,
      });
    }
  }

  await Subscription.bulkCreate(subs, { transaction });
  await SubscriptionInvoice.bulkCreate(invoices, { transaction });
  await Payment.bulkCreate(payments, { transaction });
};
