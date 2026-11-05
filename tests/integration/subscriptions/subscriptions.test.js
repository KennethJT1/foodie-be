import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { SEED_IDS } from '../../../src/db/seed/ids.js';
import request from 'supertest';
import app from '../../../src/app.js';
import { env } from '../../../src/config/env.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { processWebhookEvent } from '../../../src/modules/payments/webhook.service.js';
import { scanSubscriptions } from '../../../src/modules/subscriptions/subscriptions.service.js';
import { isVendorPublic } from '../../../src/modules/vendors/visibility.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

const { Vendor, Subscription, SubscriptionInvoice, Payment, PaymentEvent, Notification, AuditLog, Plan } = models;
const DAY = 24 * 60 * 60 * 1000;

let owner;
let auth;
let vendor;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  owner = await createUser({
    role: 'vendor',
    vendor: { name: 'Mama Put Kitchen', slug: 'mama-put-kitchen', approvalStatus: 'approved', type: 'restaurant' },
  });
  auth = bearer(owner);
  vendor = await Vendor.findOne({ where: { ownerUserId: owner.id } });
});

const api = (method, path, body, who = auth) => {
  const req = request(app)[method](`/api/v1${path}`).set('Authorization', who);
  return body === undefined ? req : req.send(body);
};

/** Pays for a plan through initialize + verify (local stand-in for Paystack). */
const pay = async (planId, interval = 'monthly') => {
  const init = await api('post', '/vendor/subscription/initialize', { planId, interval });
  expect(init.status).toBe(200);
  return api('post', '/vendor/subscription/verify', { reference: init.body.data.reference });
};

describe('GET /plans', () => {
  it('is public: plans on sale, cheapest first, yearly price from the discount', async () => {
    await Plan.update({ isRetired: true }, { where: { id: SEED_IDS.planPremium } });
    const res = await request(app).get('/api/v1/plans');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ trialDays: 14, yearlyDiscountPct: 15 });
    expect(res.body.data.map((p) => p.id)).toEqual([SEED_IDS.planBasic, SEED_IDS.planPro]);
    expect(res.body.data[1]).toMatchObject({
      name: 'Pro',
      monthlyPrice: 1200000,
      yearlyPrice: 12240000,
      limits: { menuItems: 100, photosPerItem: 3, staff: 3 },
      featured: 'occasional',
      analytics: 'full',
      isPopular: true,
    });
  });
});

describe('vendor subscription', () => {
  it('starts with nothing; the trial is available once approved', async () => {
    const res = await api('get', '/vendor/subscription');
    expect(res.body.data).toEqual({
      status: 'none',
      trialAvailable: true,
      trialDays: 14,
      graceDays: 3,
      subscription: null,
    });
  });

  it('trial: once, after approval, no card (NOT_APPROVED, TRIAL_USED)', async () => {
    await vendor.update({ approvalStatus: 'pending' });
    expect((await api('post', '/vendor/subscription/trial', { planId: SEED_IDS.planPro })).body.error.code).toBe(
      'NOT_APPROVED',
    );
    await vendor.update({ approvalStatus: 'approved' });
    expect((await api('post', '/vendor/subscription/trial', { planId: 'nope' })).body.error.fieldErrors).toEqual({
      planId: 'Pick a plan',
    });

    const res = await api('post', '/vendor/subscription/trial', { planId: SEED_IDS.planPro });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'trial',
      trialAvailable: false,
      subscription: { planId: SEED_IDS.planPro, status: 'trial', interval: 'monthly', amount: 1200000 },
    });
    const { trialEndsAt, currentPeriodStart } = res.body.data.subscription;
    expect(new Date(trialEndsAt) - new Date(currentPeriodStart)).toBe(14 * DAY);
    expect((await api('get', '/me')).body.data.vendor).toMatchObject({
      subscriptionStatus: 'trial',
      planId: SEED_IDS.planPro,
    });

    const again = await api('post', '/vendor/subscription/trial', { planId: SEED_IDS.planBasic });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TRIAL_USED');
  });

  it('initialize + verify activates the plan with an invoice and a payment; verify is idempotent', async () => {
    const init = await api('post', '/vendor/subscription/initialize', {
      planId: SEED_IDS.planBasic,
      interval: 'yearly',
    });
    expect(init.body.data).toMatchObject({ amount: 5100000, kind: 'new', email: owner.email });
    expect(init.body.data.reference).toMatch(/^SUB_/);

    const verified = await api('post', '/vendor/subscription/verify', { reference: init.body.data.reference });
    expect(verified.status).toBe(200);
    expect(verified.body.data).toMatchObject({
      status: 'active',
      subscription: { planId: SEED_IDS.planBasic, interval: 'yearly', amount: 5100000, cancelAtPeriodEnd: false },
    });
    await api('post', '/vendor/subscription/verify', { reference: init.body.data.reference }).expect(200);
    expect(await SubscriptionInvoice.count()).toBe(1);
    expect(await Payment.findOne()).toMatchObject({ status: 'success', type: 'subscription', amount: 5100000 });
    expect(await AuditLog.count({ where: { action: 'subscription.paid' } })).toBe(1);

    const invoices = await api('get', '/vendor/subscription/invoices');
    expect(invoices.body.data[0]).toMatchObject({ planName: 'Basic', interval: 'yearly', status: 'paid' });
    expect((await api('get', '/vendor/subscription/invoices?status=failed')).body.meta.total).toBe(0);
  });

  it('verify: 404 for an unknown or someone else’s reference', async () => {
    const other = await createUser({ role: 'vendor', vendor: { approvalStatus: 'approved' } });
    const init = await api(
      'post',
      '/vendor/subscription/initialize',
      { planId: SEED_IDS.planPro, interval: 'monthly' },
      bearer(other),
    );
    expect((await api('post', '/vendor/subscription/verify', { reference: init.body.data.reference })).status).toBe(
      404,
    );
    expect((await api('post', '/vendor/subscription/verify', { reference: 'SUB_NOPE' })).status).toBe(404);
  });

  it('same plan, prorated upgrade, downgrade at renewal', async () => {
    await pay(SEED_IDS.planPro);
    expect(
      (await api('post', '/vendor/subscription/initialize', { planId: SEED_IDS.planPro, interval: 'monthly' })).body
        .error.code,
    ).toBe('SAME_PLAN');
    const down = await api('post', '/vendor/subscription/initialize', {
      planId: SEED_IDS.planBasic,
      interval: 'monthly',
    });
    expect(down.body.error.code).toBe('DOWNGRADE_AT_RENEWAL');

    // Half the period used: Premium (₦25,000) minus half of Pro (₦6,000)
    const sub = await Subscription.findOne();
    await sub.update({
      currentPeriodStart: new Date(Date.now() - 15 * DAY),
      currentPeriodEnd: new Date(Date.now() + 15 * DAY),
    });
    const up = await api('post', '/vendor/subscription/initialize', {
      planId: SEED_IDS.planPremium,
      interval: 'monthly',
    });
    expect(up.body.data.kind).toBe('upgrade');
    expect(Math.abs(up.body.data.amount - 1900000)).toBeLessThan(100);
    const upgraded = await api('post', '/vendor/subscription/verify', { reference: up.body.data.reference });
    // Same interval: the period is kept
    expect(upgraded.body.data.subscription.planId).toBe(SEED_IDS.planPremium);
    expect(new Date(upgraded.body.data.subscription.currentPeriodEnd).getTime()).toBe(sub.currentPeriodEnd.getTime());

    const upPay = await api('post', '/vendor/subscription/change', {
      planId: SEED_IDS.planPremium,
      interval: 'yearly',
    });
    expect(upPay.body.error.code).toBe('PAYMENT_REQUIRED');
    const scheduled = await api('post', '/vendor/subscription/change', {
      planId: SEED_IDS.planBasic,
      interval: 'monthly',
    });
    expect(scheduled.body.data.subscription.scheduledChange).toEqual({
      planId: SEED_IDS.planBasic,
      planName: 'Basic',
      interval: 'monthly',
    });
  });

  it('cancel at period end and resume; 409 with no running plan', async () => {
    expect((await api('post', '/vendor/subscription/cancel')).body.error.code).toBe('INVALID_STATUS');
    await pay(SEED_IDS.planBasic);
    expect((await api('post', '/vendor/subscription/cancel')).body.data.subscription.cancelAtPeriodEnd).toBe(true);
    // A cancelled plan stays public until it ends
    expect(isVendorPublic(await vendor.reload())).toBe(true);
    expect((await api('post', '/vendor/subscription/resume')).body.data.subscription.cancelAtPeriodEnd).toBe(false);
  });
});

describe('renewal sweep', () => {
  const setPeriod = (fields) => Subscription.update(fields, { where: { vendorId: vendor.id } });

  it('reminds 7 and 1 days before, once each', async () => {
    await pay(SEED_IDS.planPro);
    await setPeriod({ currentPeriodEnd: new Date(Date.now() + 5 * DAY) });
    await scanSubscriptions();
    await scanSubscriptions();
    expect(await Notification.count({ where: { userId: owner.id, title: 'Your plan renews soon' } })).toBe(1);
    await setPeriod({ currentPeriodEnd: new Date(Date.now() + 12 * 60 * 60 * 1000) });
    await scanSubscriptions();
    expect(await Notification.count({ where: { userId: owner.id, title: 'Your plan renews soon' } })).toBe(2);
  });

  it('an unpaid renewal starts grace, then expires and hides the store', async () => {
    await pay(SEED_IDS.planPro);
    await setPeriod({ currentPeriodEnd: new Date(Date.now() - 1000) });
    expect(await scanSubscriptions()).toMatchObject({ periodsEnded: 1, failed: 0 });
    await vendor.reload();
    expect(vendor.subscriptionStatus).toBe('grace');
    expect(isVendorPublic(vendor)).toBe(true);
    const sub = await Subscription.findOne();
    expect(sub.graceEndsAt.getTime()).toBeGreaterThan(Date.now() + 2.9 * DAY);

    await sub.update({ graceEndsAt: new Date(Date.now() - 1000) });
    expect(await scanSubscriptions()).toMatchObject({ expired: 1 });
    await vendor.reload();
    expect(vendor.subscriptionStatus).toBe('expired');
    expect(isVendorPublic(vendor)).toBe(false);
    expect((await api('get', '/vendor/subscription')).body.data.status).toBe('expired');

    // Paying again starts a new period
    const renewed = await pay(SEED_IDS.planBasic);
    expect(renewed.body.data.status).toBe('active');
  });

  it('a trial or a cancelled plan simply ends', async () => {
    await api('post', '/vendor/subscription/trial', { planId: SEED_IDS.planPro });
    await setPeriod({ currentPeriodEnd: new Date(Date.now() - 1000) });
    await scanSubscriptions();
    expect((await vendor.reload()).subscriptionStatus).toBe('expired');
  });
});

describe('admin plans and subscriptions', () => {
  let finance;
  beforeEach(async () => {
    finance = bearer(await createUser({ role: 'admin', adminRole: 'finance', phone: null }));
  });

  it('lists every plan with live vendor counts', async () => {
    await pay(SEED_IDS.planPro);
    await Plan.update({ isRetired: true }, { where: { id: SEED_IDS.planPremium } });
    const res = await api('get', '/admin/plans', undefined, finance);
    expect(res.body.data.map((p) => [p.id, p.vendorCount, p.isRetired])).toEqual([
      [SEED_IDS.planBasic, 0, false],
      [SEED_IDS.planPro, 1, false],
      [SEED_IDS.planPremium, 0, true],
    ]);
    expect(res.body.meta).toEqual({ trialDays: 14, yearlyDiscountPct: 15 });
  });

  it('creates and edits plans; only one is popular; audited', async () => {
    const bad = await api(
      'post',
      '/admin/plans',
      { name: 'Pro', monthlyPrice: 0, limits: { photosPerItem: 20 } },
      finance,
    );
    expect(bad.body.error.fieldErrors).toEqual({
      name: 'Another plan has that name',
      monthlyPrice: 'Price must be more than ₦0',
      'limits.photosPerItem': 'Between 1 and 10',
    });
    const created = await api(
      'post',
      '/admin/plans',
      { name: 'Starter', monthlyPrice: 250000, limits: { menuItems: 10, photosPerItem: 1, staff: 1 }, isPopular: true },
      finance,
    );
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Starter', yearlyPrice: 2550000, sortOrder: 4, isPopular: true });
    expect((await Plan.findByPk(SEED_IDS.planPro)).isPopular).toBe(false);

    const edited = await api('patch', `/admin/plans/${created.body.data.id}`, { limits: { menuItems: null } }, finance);
    expect(edited.body.data.limits).toEqual({ menuItems: null, photosPerItem: 1, staff: 1 });
    expect((await api('patch', '/admin/plans/nope', { name: 'X1' }, finance)).status).toBe(404);
    expect((await AuditLog.findAll()).map((a) => a.action).sort()).toEqual(['plan.created', 'plan.updated']);
  });

  it('lists subscriptions soonest first and extends one (grace becomes active)', async () => {
    await pay(SEED_IDS.planPro);
    const list = await api('get', '/admin/subscriptions?search=mama', undefined, finance);
    expect(list.body.data[0]).toMatchObject({ vendorName: 'Mama Put Kitchen', planName: 'Pro', status: 'active' });
    const sub = await Subscription.findOne();
    await sub.update({
      status: 'grace',
      graceEndsAt: new Date(Date.now() + DAY),
      currentPeriodEnd: new Date(Date.now() - DAY),
    });
    await vendor.update({ subscriptionStatus: 'grace' });

    expect(
      (await api('post', `/admin/subscriptions/${sub.id}/extend`, { days: 0 }, finance)).body.error.fieldErrors,
    ).toEqual({
      days: 'Between 1 and 365 days',
      reason: 'Give a reason',
    });
    const res = await api('post', `/admin/subscriptions/${sub.id}/extend`, { days: 10, reason: 'Outage' }, finance);
    expect(res.body.data.status).toBe('active');
    expect(new Date(res.body.data.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now() + 9.9 * DAY);
    expect((await vendor.reload()).subscriptionStatus).toBe('active');
    expect(await AuditLog.count({ where: { action: 'subscription.extended' } })).toBe(1);
  });
});

describe('POST /webhooks/paystack', () => {
  const realKey = env.PAYSTACK_SECRET_KEY;
  beforeAll(() => {
    env.PAYSTACK_SECRET_KEY = 'sk_test_webhook_secret';
  });
  afterAll(() => {
    env.PAYSTACK_SECRET_KEY = realKey;
  });

  const send = (payload, secret = env.PAYSTACK_SECRET_KEY) => {
    const raw = JSON.stringify(payload);
    return request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', createHmac('sha512', secret).update(raw).digest('hex'))
      .send(raw);
  };

  it('refuses a bad signature, stores each event once and activates the plan', async () => {
    const init = await api('post', '/vendor/subscription/initialize', {
      planId: SEED_IDS.planPro,
      interval: 'monthly',
    });
    const { reference } = init.body.data;
    const payload = { event: 'charge.success', data: { id: 99, reference, amount: 1200000 } };

    expect((await send(payload, 'wrong')).status).toBe(401);
    expect((await send(payload)).status).toBe(200);
    expect((await send(payload)).status).toBe(200);
    expect(await PaymentEvent.count()).toBe(1);

    const event = await PaymentEvent.findOne();
    expect(await processWebhookEvent({ eventId: event.id })).toEqual({ processed: 'charge.success' });
    expect((await vendor.reload()).subscriptionStatus).toBe('active');
    expect(await processWebhookEvent({ eventId: event.id })).toEqual({ skipped: true });
    // The vendor's own verify afterwards changes nothing
    await api('post', '/vendor/subscription/verify', { reference }).expect(200);
    expect(await SubscriptionInvoice.count()).toBe(1);
  });
});
