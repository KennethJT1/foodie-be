import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { env } from '../../../src/config/env.js';
import { models } from '../../../src/db/index.js';
import { CATEGORIES } from '../../../src/db/seed/data/catalogue.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { deliveryFeeFor, processingFeeFor } from '../../../src/modules/checkout/pricing.service.js';
import { processWebhookEvent } from '../../../src/modules/payments/webhook.service.js';
import { DEFAULT_SETTINGS } from '../../../src/modules/settings/settings.defaults.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createFoodItem, createPublicVendor, createUser } from '../../helpers/factories.js';

const { Address, Notification, Order, OrderItem, Payment, PaymentEvent, FoodItem } = models;

let ada;
let owner;
let vendor;
let jollof;
let address;

const SIZE = {
  id: 'grp_size',
  name: 'Portion size',
  required: true,
  max: 1,
  options: [
    { id: 'opt_reg', name: 'Regular', price: 0 },
    { id: 'opt_large', name: 'Large', price: 100000 },
  ],
};

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await models.Category.bulkCreate(CATEGORIES);
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  ({ owner, vendor } = await createPublicVendor({ vendor: { name: 'Mama Put Kitchen', prepTimeMins: 20 } }));
  jollof = await createFoodItem(vendor, { name: 'Party jollof rice', price: 350000, optionGroups: [SIZE] });
  // About 1.3 km from the store in Yaba
  address = await Address.create({
    userId: ada.id,
    line1: '5 Commercial Avenue',
    area: 'Yaba',
    city: 'Lagos',
    lat: 6.5095,
    lng: 3.3711,
    isDefault: true,
  });
});

const cart = (overrides = {}) => ({
  vendorId: vendor.id,
  addressId: address.id,
  items: [{ foodItemId: jollof.id, quantity: 2, optionIds: ['opt_large'] }],
  ...overrides,
});
const post = (path, body, who = ada) =>
  request(app).post(`/api/v1${path}`).set('Authorization', bearer(who)).send(body);

describe('fees (handoff section 6)', () => {
  it('delivery: base + ceil(km) × per km, capped; processing: % + flat from ₦2,500, capped', () => {
    expect(deliveryFeeFor(1300, DEFAULT_SETTINGS)).toBe(50000 + 2 * 15000);
    expect(deliveryFeeFor(40_000, DEFAULT_SETTINGS)).toBe(300000);
    expect(processingFeeFor(200000, DEFAULT_SETTINGS)).toBe(3000);
    expect(processingFeeFor(1000000, DEFAULT_SETTINGS)).toBe(15000 + 10000);
    expect(processingFeeFor(50_000_000, DEFAULT_SETTINGS)).toBe(200000);
  });
});

describe('POST /checkout/quote', () => {
  it('prices the cart on the server with options, fees and ETA', async () => {
    const res = await post('/checkout/quote', cart());
    expect(res.status).toBe(200);
    const q = res.body.data;
    expect(q.lines).toEqual([
      expect.objectContaining({
        foodItemId: jollof.id,
        unitPrice: 350000,
        quantity: 2,
        lineTotal: 900000,
        options: [expect.objectContaining({ optionId: 'opt_large', price: 100000 })],
      }),
    ]);
    expect(q.subtotal).toBe(900000);
    expect(q.deliveryFee).toBe(deliveryFeeFor(q.distanceM, DEFAULT_SETTINGS));
    expect(q.processingFee).toBe(processingFeeFor(900000 + q.deliveryFee, DEFAULT_SETTINGS));
    expect(q.total).toBe(q.subtotal + q.deliveryFee + q.processingFee);
    expect(q).toMatchObject({ isOpen: true, scheduledFor: null, address: { area: 'Yaba' } });
    expect(q.etaMins).toHaveLength(2);
  });

  it('422 codes: EMPTY_CART, ITEM_UNAVAILABLE, VENDOR_PAUSED, OUT_OF_RANGE, VENDOR_CLOSED; required options', async () => {
    const code = async (body) => (await post('/checkout/quote', body)).body.error;
    expect((await code(cart({ items: [] }))).code).toBe('EMPTY_CART');
    expect((await code(cart({ items: [{ foodItemId: 'nope' }] }))).code).toBe('ITEM_UNAVAILABLE');
    expect(await code(cart({ items: [{ foodItemId: jollof.id }] }))).toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { 'items.0.optionIds': 'Choose portion size' },
    });
    await jollof.update({ isAvailable: false });
    expect((await code(cart())).message).toBe('Party jollof rice is sold out. Remove it to continue.');
    await jollof.update({ isAvailable: true });
    expect((await code(cart({ address: { line1: 'Lekki', lat: 6.44, lng: 3.6 }, addressId: undefined }))).code).toBe(
      'OUT_OF_RANGE',
    );
    await models.VendorOpeningHour.update({ isClosed: true }, { where: { vendorId: vendor.id } });
    expect((await code(cart())).code).toBe('VENDOR_CLOSED');
    await vendor.update({ isPaused: true });
    expect((await code(cart())).code).toBe('VENDOR_PAUSED');
    await vendor.update({ subscriptionStatus: 'expired' });
    expect((await post('/checkout/quote', cart())).status).toBe(404);
  });

  it('customers only', async () => {
    expect((await post('/checkout/quote', cart(), owner)).status).toBe(403);
  });
});

describe('payments', () => {
  it('initialize starts a payment (no order yet); verify creates the order once', async () => {
    const init = await post('/payments/initialize', { ...cart(), deliveryNote: 'Gate 2' });
    expect(init.status).toBe(200);
    expect(init.body.data).toMatchObject({ reference: expect.stringMatching(/^KJT_/), email: ada.email });
    expect(await Order.count()).toBe(0);
    const payment = await Payment.findOne();
    expect(payment).toMatchObject({
      type: 'order',
      status: 'pending',
      amount: init.body.data.amount,
      vendorShare: 900000,
    });

    const verify = await post('/payments/verify', { reference: init.body.data.reference });
    expect(verify.status).toBe(200);
    const order = verify.body.data.order;
    expect(verify.body.data).toMatchObject({ status: 'success', reference: init.body.data.reference });
    expect(order).toMatchObject({
      status: 'paid',
      customerName: 'Ada Okafor',
      vendorName: 'Mama Put Kitchen',
      deliveryNote: 'Gate 2',
      itemCount: 2,
      total: init.body.data.amount,
      deliveryCode: expect.stringMatching(/^\d{4}$/),
      statusHistory: [expect.objectContaining({ status: 'paid', by: 'system' })],
      payment: { status: 'success', channel: 'card' },
    });
    expect(order.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(new Date(order.acceptDeadline) - new Date(order.createdAt)).toBeGreaterThan(290_000);
    expect((await FoodItem.findByPk(jollof.id)).ordersCount).toBe(2);
    expect(await Notification.count({ where: { userId: owner.id, title: 'New order' } })).toBe(1);

    await post('/payments/verify', { reference: init.body.data.reference }).expect(200);
    expect(await Order.count()).toBe(1);
    expect(await OrderItem.count()).toBe(1);
    expect((await post('/payments/verify', { reference: 'KJT_NOPE' })).status).toBe(404);
  });

  it('someone else’s reference is a 404', async () => {
    const init = await post('/payments/initialize', cart());
    const other = await createUser();
    expect((await post('/payments/verify', { reference: init.body.data.reference }, other)).status).toBe(404);
  });

  it('/me/payments lists paid ones (not unpaid checkouts)', async () => {
    await post('/payments/initialize', cart());
    const paid = await post('/payments/initialize', cart());
    await post('/payments/verify', { reference: paid.body.data.reference });
    const res = await request(app).get('/api/v1/me/payments').set('Authorization', bearer(ada));
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      status: 'success',
      vendorName: 'Mama Put Kitchen',
      orderCode: expect.any(String),
    });
  });
});

describe('webhook charge.success creates the order', () => {
  const realKey = env.PAYSTACK_SECRET_KEY;
  beforeAll(() => {
    env.PAYSTACK_SECRET_KEY = 'sk_test_orders';
  });
  afterAll(() => {
    env.PAYSTACK_SECRET_KEY = realKey;
  });

  it('and the customer’s verify afterwards returns the same order', async () => {
    const init = await post('/payments/initialize', cart());
    const raw = JSON.stringify({ event: 'charge.success', data: { id: 7, reference: init.body.data.reference } });
    await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(raw).digest('hex'))
      .send(raw)
      .expect(200);
    await processWebhookEvent({ eventId: (await PaymentEvent.findOne()).id });
    expect(await Order.count()).toBe(1);
    const verify = await post('/payments/verify', { reference: init.body.data.reference });
    expect(verify.body.data.order.id).toBe((await Order.findOne()).id);
  });
});
