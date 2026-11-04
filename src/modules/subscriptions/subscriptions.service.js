// Vendor plans and billing (BRD section 4: BR-SUB-01..07). Reference behaviour: foodie-fe
// src/mocks/handlers/subscriptions.js and src/mocks/utils/subscriptions.js.
//
// Payments are one-off Paystack transactions per period. The card from the last payment is kept
// (when Paystack marks it reusable) and charged at renewal by the hourly sweep; a failed or
// impossible renewal starts the grace period, then the plan expires and the store is hidden.
import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import { logger } from '../../config/logger.js';
import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { models, withTransaction } from '../../db/index.js';
import { paystack, paystackMode } from '../../integrations/paystack/paystack.client.js';
import { notify } from '../notifications/notifications.service.js';
import { getSettings } from '../settings/settings.service.js';
import { ownVendor } from '../vendors/onboarding.service.js';
import { priceOf, toPlanDto } from './plans.service.js';

const { Plan, Subscription, SubscriptionInvoice, Payment, Vendor, User } = models;

const DAY = 24 * 60 * 60 * 1000;
export const PERIOD_DAYS = { monthly: 30, yearly: 365 };
// Paystack's smallest sensible charge; a nearly finished period never makes an upgrade free
const MIN_UPGRADE_KOBO = 10_000;
// Locally (no Paystack): the fee a card payment would cost, for the payment record
const LOCAL_FEE_PCT = 1.5;

export const newReference = () => `SUB_${randomBytes(8).toString('hex').toUpperCase()}`;

const iso = (date) => (date ? date.toISOString() : null);

/** VendorSubscription (contract). `sub` includes `plan` and `scheduledPlan`. */
export const toSubscriptionDto = (vendor, sub, settings) => ({
  status: vendor.subscriptionStatus === 'cancelled' ? 'expired' : vendor.subscriptionStatus,
  trialAvailable: !vendor.trialUsed && vendor.approvalStatus === 'approved',
  trialDays: settings.trialDays,
  graceDays: settings.graceDays,
  subscription: sub && {
    id: sub.id,
    planId: sub.planId,
    plan: sub.plan && toPlanDto(sub.plan, settings),
    interval: sub.interval,
    status: sub.status,
    amount: sub.plan ? priceOf(sub.plan, sub.interval, settings) : 0,
    currentPeriodStart: iso(sub.currentPeriodStart),
    currentPeriodEnd: iso(sub.currentPeriodEnd),
    trialEndsAt: iso(sub.trialEndsAt),
    graceEndsAt: iso(sub.graceEndsAt),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    scheduledChange: sub.scheduledPlanId
      ? { planId: sub.scheduledPlanId, planName: sub.scheduledPlan?.name ?? '', interval: sub.scheduledInterval }
      : null,
  },
});

const SUB_INCLUDE = [
  { model: Plan, as: 'plan' },
  { model: Plan, as: 'scheduledPlan' },
];

export const subscriptionOf = (vendorId, { transaction, lock } = {}) =>
  Subscription.findOne({
    where: { vendorId },
    include: lock ? undefined : SUB_INCLUDE,
    transaction,
    ...(lock && { lock: transaction.LOCK.UPDATE }),
  });

/** The admin vendor detail's `subscription` block. */
export const subscriptionForVendor = async (vendor, { transaction } = {}) => {
  const [sub, settings] = await Promise.all([subscriptionOf(vendor.id, { transaction }), getSettings()]);
  return toSubscriptionDto(vendor, sub, settings).subscription;
};

const present = async (vendor, transaction) => {
  const [sub, settings] = await Promise.all([subscriptionOf(vendor.id, { transaction }), getSettings()]);
  return toSubscriptionDto(vendor, sub, settings);
};

/** Plan actions need an approved store (409 NOT_APPROVED). */
const approvedVendor = async (user, options) => {
  const vendor = await ownVendor(user, options);
  if (vendor.approvalStatus !== 'approved') {
    throw new ConflictError('NOT_APPROVED', 'Your store needs to be approved before you pick a plan.');
  }
  return vendor;
};

/** A plan on sale and an interval, or 422 on `planId` / `interval`. */
const readPlanChoice = async ({ planId, interval }, { requireInterval = true, transaction } = {}) => {
  const plan = planId ? await Plan.findByPk(String(planId), { transaction }) : null;
  const errors = {};
  if (!plan || plan.isRetired) errors.planId = 'Pick a plan';
  if (requireInterval && !['monthly', 'yearly'].includes(interval)) errors.interval = 'Pick monthly or yearly';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return plan;
};

/**
 * What choosing `plan` / `interval` means now (BR-SUB-03): `new` (no running paid plan: first
 * plan, after a trial, in grace or expired), `same`, `downgrade` (waits for renewal) or `upgrade`
 * (paid now, with credit for the unused part of the current period).
 */
export const quoteChange = (vendor, sub, plan, interval, settings) => {
  const full = priceOf(plan, interval, settings);
  if (vendor.subscriptionStatus !== 'active' || !sub) return { kind: 'new', amount: full };
  const current = sub.plan;
  if (sub.planId === plan.id && sub.interval === interval) return { kind: 'same', amount: 0 };
  const isUpgrade =
    plan.monthlyPrice > current.monthlyPrice ||
    (plan.id === current.id && interval === 'yearly' && sub.interval === 'monthly');
  if (!isUpgrade) return { kind: 'downgrade', amount: 0 };
  const start = sub.currentPeriodStart.getTime();
  const end = sub.currentPeriodEnd.getTime();
  const left = Math.max(0, Math.min(1, (end - Date.now()) / (end - start)));
  const credit = Math.round(priceOf(current, sub.interval, settings) * left);
  return { kind: 'upgrade', amount: Math.max(MIN_UPGRADE_KOBO, full - credit) };
};

/** GET /vendor/subscription (any vendor; drafts see status none). */
export const getSubscription = async (user) => present(await ownVendor(user));

// GET /vendor/subscription/invoices (handoff section 3): search reference, plan name; filter status
const INVOICE_LIST = {
  searchFields: ['reference', '$plan.name$'],
  filters: { status: 'status' },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', amount: 'amount', status: 'status' },
  include: [{ model: Plan, as: 'plan', attributes: ['id', 'name'] }],
};

export const listInvoices = async (user, query) => {
  const vendor = await ownVendor(user);
  const { data, meta } = await paginate(
    SubscriptionInvoice,
    buildListQuery(query, INVOICE_LIST, { scope: { vendorId: vendor.id } }),
  );
  return {
    data: data.map((i) => ({
      id: i.id,
      planId: i.planId,
      planName: i.plan?.name ?? '',
      interval: i.interval,
      amount: i.amount,
      status: i.status,
      reference: i.reference,
      periodStart: iso(i.periodStart),
      periodEnd: iso(i.periodEnd),
      createdAt: i.createdAt.toISOString(),
    })),
    meta,
  };
};

/** Sets the vendor's mirrored status (and plan); public reads filter on vendors.subscription_status. */
const syncVendor = (vendor, fields, transaction) => vendor.update(fields, { transaction });

/** POST /vendor/subscription/trial (BR-SUB-01): once per business, after approval, no card. */
export const startTrial = async (user, body) =>
  withTransaction(async (transaction) => {
    const vendor = await approvedVendor(user, { transaction, lock: true });
    const plan = await readPlanChoice(body, { requireInterval: false, transaction });
    if (vendor.trialUsed || vendor.subscriptionStatus !== 'none') {
      throw new ConflictError('TRIAL_USED', 'Your store has already used its free trial. Pick a plan to continue.');
    }
    const settings = await getSettings();
    const now = new Date();
    const ends = new Date(now.getTime() + settings.trialDays * DAY);
    const fields = {
      planId: plan.id,
      interval: 'monthly',
      status: 'trial',
      currentPeriodStart: now,
      currentPeriodEnd: ends,
      trialEndsAt: ends,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledPlanId: null,
      scheduledInterval: null,
      reminded7dAt: null,
      reminded1dAt: null,
    };
    const existing = await subscriptionOf(vendor.id, { transaction, lock: true });
    if (existing) await existing.update(fields, { transaction });
    else await Subscription.create({ vendorId: vendor.id, ...fields }, { transaction });
    await syncVendor(vendor, { planId: plan.id, subscriptionStatus: 'trial', trialUsed: true }, transaction);
    await notify(
      user.id,
      {
        type: 'subscription',
        title: `Your ${plan.name} trial has started`,
        body: `You have ${settings.trialDays} days free. We'll remind you before it ends.`,
        link: '/vendor/subscription',
      },
      { transaction },
    );
    return present(vendor, transaction);
  });

const payerEmail = (user) => user.email ?? `${user.id}@vendors.kjtfoodie.test`;

/** POST /vendor/subscription/initialize: first plan, renewal or prorated upgrade (BR-SUB-03). */
export const initializePayment = async (user, body) => {
  const vendor = await approvedVendor(user);
  const plan = await readPlanChoice(body);
  const [sub, settings] = await Promise.all([subscriptionOf(vendor.id), getSettings()]);
  const quote = quoteChange(vendor, sub, plan, body.interval, settings);
  if (quote.kind === 'same') throw new ConflictError('SAME_PLAN', `You're already on ${plan.name}.`);
  if (quote.kind === 'downgrade') {
    throw new ConflictError(
      'DOWNGRADE_AT_RENEWAL',
      'Smaller plans start at your next renewal. Use "Switch at renewal".',
    );
  }

  const reference = newReference();
  const email = payerEmail(user);
  const metadata = { planId: plan.id, interval: body.interval, kind: quote.kind };
  const { accessCode } = paystackMode.live()
    ? await paystack.initializeTransaction({
        email,
        amount: quote.amount,
        reference,
        metadata: { ...metadata, type: 'subscription', vendorId: vendor.id },
      })
    : { accessCode: randomBytes(6).toString('hex') };
  await Payment.create({
    reference,
    type: 'subscription',
    userId: user.id,
    vendorId: vendor.id,
    amount: quote.amount,
    platformShare: quote.amount,
    accessCode,
    metadata,
  });
  return { reference, accessCode, amount: quote.amount, kind: quote.kind, email };
};

/** Puts the vendor on the paid plan: a new period from now, or the same period on an upgrade. */
const activate = async (vendor, sub, { planId, interval, kind }, card, transaction) => {
  const now = new Date();
  const keepPeriod = kind === 'upgrade' && sub?.status === 'active' && sub.interval === interval;
  const fields = {
    planId,
    interval,
    status: 'active',
    currentPeriodStart: keepPeriod ? sub.currentPeriodStart : now,
    currentPeriodEnd: keepPeriod ? sub.currentPeriodEnd : new Date(now.getTime() + PERIOD_DAYS[interval] * DAY),
    trialEndsAt: null,
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    scheduledPlanId: null,
    scheduledInterval: null,
    ...(!keepPeriod && { reminded7dAt: null, reminded1dAt: null }),
    ...(card.authorizationCode && { paystackAuthorizationCode: card.authorizationCode }),
    ...(card.email && { paystackEmail: card.email }),
  };
  const saved = sub
    ? await sub.update(fields, { transaction })
    : await Subscription.create({ vendorId: vendor.id, ...fields }, { transaction });
  await syncVendor(vendor, { planId, subscriptionStatus: 'active' }, transaction);
  return saved;
};

/** Paystack's answer for a pending payment; locally a card payment that succeeded. */
const checkWithGateway = async (payment) => {
  if (!paystackMode.live()) {
    return {
      status: 'success',
      amount: payment.amount,
      channel: 'card',
      fee: Math.round((payment.amount * LOCAL_FEE_PCT) / 100),
      paidAt: new Date(),
      authorizationCode: null,
      email: null,
    };
  }
  return paystack.verifyTransaction(payment.reference);
};

const NOT_RECEIVED = "We haven't received this payment yet. If you were charged, it will show here shortly.";

/**
 * Confirms a plan payment and activates the plan. Idempotent: called by POST
 * /vendor/subscription/verify and by the Paystack webhook, in any order, any number of times.
 * `vendorId` scopes the lookup for vendors (someone else's reference is a 404).
 */
export const confirmSubscriptionPayment = async (reference, { vendorId, actor = null, req } = {}) => {
  const scope = { reference, type: 'subscription', ...(vendorId && { vendorId }) };
  const found = await Payment.findOne({ where: scope });
  if (!found) throw new NotFoundError("We couldn't find that payment.");
  if (found.status === 'success') return found;

  // Ask the gateway outside the transaction; the row lock below settles races with the webhook
  const tx = await checkWithGateway(found);

  return withTransaction(async (transaction) => {
    const payment = await Payment.findOne({ where: scope, transaction, lock: transaction.LOCK.UPDATE });
    if (payment.status === 'success') return payment;
    if (tx.status !== 'success') {
      if (['failed', 'abandoned'].includes(tx.status)) await payment.update({ status: tx.status }, { transaction });
      throw new ConflictError('INVALID_STATUS', NOT_RECEIVED);
    }
    if (tx.amount !== payment.amount) {
      // Never activate on a short payment; finance sees the flag on /admin/payments
      await payment.update({ flag: 'amount_mismatch' }, { transaction });
      logger.error({ reference, expected: payment.amount, paid: tx.amount }, 'Subscription payment amount mismatch');
      throw new ConflictError('INVALID_STATUS', NOT_RECEIVED);
    }

    const vendor = await Vendor.findByPk(payment.vendorId, { transaction, lock: transaction.LOCK.UPDATE });
    const sub = await subscriptionOf(vendor.id, { transaction, lock: true });
    const saved = await activate(vendor, sub, payment.metadata, tx, transaction);
    const plan = await Plan.findByPk(payment.metadata.planId, { transaction });

    await payment.update(
      {
        status: 'success',
        channel: tx.channel,
        fee: tx.fee,
        paidAt: tx.paidAt ?? new Date(),
        settlementStatus: 'settling',
      },
      { transaction },
    );
    await SubscriptionInvoice.create(
      {
        vendorId: vendor.id,
        subscriptionId: saved.id,
        planId: plan.id,
        interval: payment.metadata.interval,
        amount: payment.amount,
        status: 'paid',
        reference,
        periodStart: saved.currentPeriodStart,
        periodEnd: saved.currentPeriodEnd,
      },
      { transaction },
    );
    await audit.log(
      {
        actor,
        action: 'subscription.paid',
        targetType: 'subscription',
        targetId: saved.id,
        summary: `${vendor.name}: ₦${(payment.amount / 100).toLocaleString('en-NG')} for ${plan.name} (${payment.metadata.interval}, ${reference})`,
        req,
      },
      { transaction },
    );
    await notify(
      vendor.ownerUserId,
      {
        type: 'subscription',
        title: `You're on the ${plan.name} plan`,
        body: 'Payment received. Your store is visible to customers.',
        link: '/vendor/subscription',
      },
      { transaction },
    );
    return payment;
  });
};

/** POST /vendor/subscription/verify (idempotent). */
export const verifyPayment = async (user, { reference }, req) => {
  const vendor = await ownVendor(user);
  await confirmSubscriptionPayment(String(reference ?? ''), { vendorId: vendor.id, actor: user, req });
  return present(await vendor.reload());
};

/** POST /vendor/subscription/change: schedules a downgrade for the next renewal. */
export const scheduleChange = async (user, body) =>
  withTransaction(async (transaction) => {
    const vendor = await approvedVendor(user, { transaction, lock: true });
    const plan = await readPlanChoice(body, { transaction });
    const [sub, settings] = await Promise.all([subscriptionOf(vendor.id, { transaction }), getSettings()]);
    if (quoteChange(vendor, sub, plan, body.interval, settings).kind !== 'downgrade') {
      throw new ConflictError('PAYMENT_REQUIRED', 'This change needs a payment. Choose the plan to pay for it.');
    }
    await sub.update({ scheduledPlanId: plan.id, scheduledInterval: body.interval }, { transaction });
    return present(vendor, transaction);
  });

/** POST /vendor/subscription/cancel (BR-SUB-02) and /resume: only while the plan runs. */
export const setCancelAtPeriodEnd = async (user, cancel) =>
  withTransaction(async (transaction) => {
    const vendor = await approvedVendor(user, { transaction, lock: true });
    const sub = await subscriptionOf(vendor.id, { transaction, lock: true });
    if (!sub || !['active', 'trial'].includes(vendor.subscriptionStatus)) {
      throw new ConflictError(
        'INVALID_STATUS',
        cancel ? 'There is no running plan to cancel.' : 'This plan has already ended. Renew it instead.',
      );
    }
    await sub.update({ cancelAtPeriodEnd: cancel }, { transaction });
    return present(vendor, transaction);
  });

// ── Admin ────────────────────────────────────────────────────────────────────

// GET /admin/subscriptions (handoff section 3): search vendor, plan; soonest to end first
const ADMIN_LIST = {
  searchFields: ['$vendor.name$', '$plan.name$'],
  filters: { status: 'status', planId: 'planId', interval: 'interval' },
  dateField: 'currentPeriodEnd',
  defaultSort: 'currentPeriodEnd',
  sortable: {
    currentPeriodEnd: 'currentPeriodEnd',
    createdAt: 'createdAt',
    status: 'status',
    vendorName: ['vendor', 'name'],
  },
  include: [
    { model: Vendor, as: 'vendor', attributes: ['id', 'name'] },
    { model: Plan, as: 'plan', attributes: ['id', 'name'] },
  ],
};

export const listAdminSubscriptions = async (query) => {
  const { data, meta } = await paginate(Subscription, buildListQuery(query, ADMIN_LIST));
  return {
    data: data.map((s) => ({
      id: s.id,
      vendorId: s.vendorId,
      vendorName: s.vendor?.name ?? '',
      planId: s.planId,
      planName: s.plan?.name ?? '',
      interval: s.interval,
      status: s.status,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      currentPeriodEnd: iso(s.currentPeriodEnd),
      trialEndsAt: iso(s.trialEndsAt),
      graceEndsAt: iso(s.graceEndsAt),
    })),
    meta,
  };
};

/** POST /admin/subscriptions/{id}/extend (BR-SUB-07): free days; grace / expired become active. */
export const extendSubscription = async (actor, id, { days, reason }, req) =>
  withTransaction(async (transaction) => {
    const sub = await Subscription.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!sub) throw new NotFoundError("We couldn't find that subscription.");
    const vendor = await Vendor.findByPk(sub.vendorId, { transaction, lock: transaction.LOCK.UPDATE });
    const base = Math.max(Date.now(), sub.currentPeriodEnd.getTime());
    const end = new Date(base + days * DAY);
    const revive = ['grace', 'expired'].includes(sub.status);
    await sub.update(
      {
        currentPeriodEnd: end,
        ...(sub.status === 'trial' && { trialEndsAt: end }),
        ...(revive && { status: 'active', graceEndsAt: null }),
        reminded7dAt: null,
        reminded1dAt: null,
      },
      { transaction },
    );
    if (revive) await syncVendor(vendor, { subscriptionStatus: 'active' }, transaction);
    await audit.log(
      {
        actor,
        action: 'subscription.extended',
        targetType: 'subscription',
        targetId: sub.id,
        summary: `${vendor.name}: +${days} days (${reason})`,
        req,
      },
      { transaction },
    );
    await notify(
      vendor.ownerUserId,
      {
        type: 'subscription',
        title: `We added ${days} days to your plan`,
        body: `Your plan now runs until ${end.toISOString().slice(0, 10)}.`,
        link: '/vendor/subscription',
      },
      { transaction },
    );
    return { id: sub.id, status: sub.status, currentPeriodEnd: end.toISOString() };
  });

// ── Renewal sweep (scheduler: subscriptions.scan, hourly) ────────────────────

const lagosDate = (date) =>
  date.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' });

/** Fills `{{name}}` placeholders in a notification template. */
const fill = (text, values) => text.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);

const ownerOf = (vendor, transaction) => User.findByPk(vendor.ownerUserId, { transaction });

/** 7-day and 1-day reminders before a trial ends or a plan renews, each once per period. */
const sendReminders = async (now, settings) => {
  const template = settings.notificationTemplates.find((t) => t.key === 'subscription_reminder');
  for (const [days, column] of [
    [7, 'reminded7dAt'],
    [1, 'reminded1dAt'],
  ]) {
    const due = await Subscription.findAll({
      where: {
        status: ['trial', 'active'],
        [column]: null,
        currentPeriodEnd: { [Op.gt]: now, [Op.lte]: new Date(now.getTime() + days * DAY) },
      },
      include: [
        { model: Plan, as: 'plan' },
        { model: Vendor, as: 'vendor' },
      ],
    });
    for (const sub of due) {
      await withTransaction(async (transaction) => {
        const owner = await ownerOf(sub.vendor, transaction);
        const date = lagosDate(sub.currentPeriodEnd);
        const ending = sub.status === 'trial' || sub.cancelAtPeriodEnd;
        const body = ending
          ? `Your ${sub.plan.name} ${sub.status === 'trial' ? 'trial' : 'plan'} ends on ${date}. Pick a plan to keep your store visible.`
          : fill(template?.body ?? 'Your {{plan}} plan renews on {{date}}.', { plan: sub.plan.name, date });
        await notify(
          owner.id,
          {
            type: 'subscription',
            title: ending ? 'Your plan ends soon' : (template?.subject ?? 'Your plan renews soon'),
            body,
            link: '/vendor/subscription',
          },
          {
            transaction,
            ...(owner.email && { email: { to: owner.email, subject: template?.subject || 'Your plan', text: body } }),
          },
        );
        await sub.update({ [column]: now }, { transaction });
      });
    }
  }
};

/** Charges the saved card for the next period; null when there is no card or no Paystack. */
const chargeRenewal = async (sub, plan, interval, amount) => {
  if (!sub.paystackAuthorizationCode || !paystackMode.live()) return null;
  const reference = newReference();
  try {
    const tx = await paystack.chargeAuthorization({
      authorizationCode: sub.paystackAuthorizationCode,
      email: sub.paystackEmail,
      amount,
      reference,
      metadata: { type: 'subscription', vendorId: sub.vendorId, planId: plan.id, interval, kind: 'renewal' },
    });
    return { ...tx, reference };
  } catch (err) {
    logger.error({ err, subscriptionId: sub.id }, 'Renewal charge failed');
    return { status: 'failed', reference, amount };
  }
};

/** A period that ended: expire it, renew it (saved card) or start grace. */
const endPeriod = async (subId, now, settings) => {
  const sub = await Subscription.findByPk(subId, { include: SUB_INCLUDE });
  // A cancelled plan, an unpaid trial and a lapsed grace period simply end
  if (sub.status === 'trial' || sub.cancelAtPeriodEnd) return expire(sub, 'Your plan has ended');

  const plan = sub.scheduledPlan ?? sub.plan;
  const interval = sub.scheduledInterval ?? sub.interval;
  const amount = priceOf(plan, interval, settings);
  const charge = await chargeRenewal(sub, plan, interval, amount);
  const paid = charge?.status === 'success' && charge.amount === amount;

  await withTransaction(async (transaction) => {
    const vendor = await Vendor.findByPk(sub.vendorId, { transaction, lock: transaction.LOCK.UPDATE });
    if (charge) {
      await Payment.create(
        {
          reference: charge.reference,
          type: 'subscription',
          userId: vendor.ownerUserId,
          vendorId: vendor.id,
          amount,
          platformShare: amount,
          fee: charge.fee ?? 0,
          channel: charge.channel ?? 'card',
          status: paid ? 'success' : 'failed',
          settlementStatus: paid ? 'settling' : null,
          paidAt: paid ? (charge.paidAt ?? now) : null,
          metadata: { planId: plan.id, interval, kind: 'renewal' },
        },
        { transaction },
      );
    }
    if (paid) {
      const start = sub.currentPeriodEnd;
      await sub.update(
        {
          planId: plan.id,
          interval,
          currentPeriodStart: start,
          currentPeriodEnd: new Date(start.getTime() + PERIOD_DAYS[interval] * DAY),
          scheduledPlanId: null,
          scheduledInterval: null,
          reminded7dAt: null,
          reminded1dAt: null,
        },
        { transaction },
      );
      await syncVendor(vendor, { planId: plan.id }, transaction);
    } else {
      await sub.update(
        { status: 'grace', graceEndsAt: new Date(now.getTime() + settings.graceDays * DAY) },
        { transaction },
      );
      await syncVendor(vendor, { subscriptionStatus: 'grace' }, transaction);
    }
    if (charge) {
      await SubscriptionInvoice.create(
        {
          vendorId: vendor.id,
          subscriptionId: sub.id,
          planId: plan.id,
          interval,
          amount,
          status: paid ? 'paid' : 'failed',
          reference: charge.reference,
          periodStart: paid ? sub.currentPeriodStart : null,
          periodEnd: paid ? sub.currentPeriodEnd : null,
        },
        { transaction },
      );
    }
    await notify(
      vendor.ownerUserId,
      paid
        ? {
            type: 'subscription',
            title: `Your ${plan.name} plan renewed`,
            body: `We charged your card ₦${(amount / 100).toLocaleString('en-NG')}.`,
            link: '/vendor/subscription',
          }
        : {
            type: 'subscription',
            title: "We couldn't renew your plan",
            body: `Pay within ${settings.graceDays} days to keep your store visible.`,
            link: '/vendor/subscription',
          },
      { transaction },
    );
  });
};

async function expire(sub, title) {
  await withTransaction(async (transaction) => {
    const vendor = await Vendor.findByPk(sub.vendorId, { transaction, lock: transaction.LOCK.UPDATE });
    await sub.update({ status: 'expired', graceEndsAt: null, cancelAtPeriodEnd: false }, { transaction });
    await syncVendor(vendor, { subscriptionStatus: 'expired' }, transaction);
    await notify(
      vendor.ownerUserId,
      {
        type: 'subscription',
        title,
        body: 'Your store is hidden from customers until you pick a plan.',
        link: '/vendor/subscription',
      },
      { transaction },
    );
  });
}

/**
 * The hourly sweep (BR-SUB-02, BR-SUB-06): reminders, period ends (renew or grace), grace ends
 * (expired, store hidden). Each subscription is handled on its own, so one failure doesn't stop
 * the rest. Returns counts for the job log.
 */
export const scanSubscriptions = async (now = new Date()) => {
  const settings = await getSettings();
  await sendReminders(now, settings);

  const ended = await Subscription.findAll({
    where: { status: ['trial', 'active'], currentPeriodEnd: { [Op.lte]: now } },
    attributes: ['id'],
  });
  const lapsed = await Subscription.findAll({
    where: { status: 'grace', graceEndsAt: { [Op.lte]: now } },
    include: SUB_INCLUDE,
  });
  let failed = 0;
  for (const { id } of ended) {
    await endPeriod(id, now, settings).catch((err) => {
      failed += 1;
      logger.error({ err, subscriptionId: id }, 'Could not end subscription period');
    });
  }
  for (const sub of lapsed) {
    await expire(sub, 'Your plan has expired').catch((err) => {
      failed += 1;
      logger.error({ err, subscriptionId: sub.id }, 'Could not expire subscription');
    });
  }
  return { periodsEnded: ended.length, expired: lapsed.length, failed };
};
