import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { CATEGORIES } from '../../../src/db/seed/data/catalogue.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { autoReject } from '../../../src/modules/orders/orders.service.js';
import { settlePayments } from '../../../src/modules/payments/settlement.service.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createFoodItem, createPublicVendor, createUser } from '../../helpers/factories.js';

const { Address, AuditLog, Order, Payment, User } = models;

let ada;
let owner;
let vendor;
let dish;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await models.Category.bulkCreate(CATEGORIES);
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  ({ owner, vendor } = await createPublicVendor({ vendor: { name: 'Mama Put Kitchen' } }));
  dish = await createFoodItem(vendor, { name: 'Party jollof rice', price: 350000 });
  await Address.create({
    userId: ada.id,
    line1: '5 Commercial Avenue',
    area: 'Yaba',
    city: 'Lagos',
    lat: 6.5095,
    lng: 3.3711,
    isDefault: true,
  });
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

/** A paid order through the real checkout (local payment stand-in). */
const placeOrder = async (customer = ada) => {
  const address = await Address.findOne({ where: { userId: customer.id } });
  const init = await api('post', '/payments/initialize', customer, {
    vendorId: vendor.id,
    addressId: address.id,
    items: [{ foodItemId: dish.id, quantity: 1 }],
  });
  return (await api('post', '/payments/verify', customer, { reference: init.body.data.reference })).body.data.order;
};

describe('scoped reads', () => {
  it('customers see their own, vendors their store’s, admins with orders.view all; the code only for customer + admin', async () => {
    const order = await placeOrder();
    const other = await createUser();
    await Address.create({
      userId: other.id,
      line1: '9 Herbert Macaulay',
      area: 'Yaba',
      city: 'Lagos',
      lat: 6.51,
      lng: 3.38,
      isDefault: true,
    });
    await placeOrder(other);

    expect((await api('get', '/orders', ada)).body.meta.total).toBe(1);
    expect((await api('get', `/orders/${order.id}`, other)).status).toBe(404);
    const vendorView = await api('get', `/orders/${order.id}`, owner);
    expect(vendorView.body.data).toMatchObject({ id: order.id, vendor: { name: 'Mama Put Kitchen' } });
    expect(vendorView.body.data.deliveryCode).toBeUndefined();
    expect((await api('get', '/orders', owner)).body.meta.total).toBe(2);

    const support = await createUser({ role: 'admin', adminRole: 'support', phone: null });
    const admin = await api('get', `/orders/${order.id}`, support);
    expect(admin.body.data.deliveryCode).toMatch(/^\d{4}$/);
    const finance = await createUser({ role: 'admin', adminRole: 'onboarding', phone: null });
    expect((await api('get', '/orders', finance)).status).toBe(403);

    expect((await api('get', '/orders?active=false', ada)).body.meta.total).toBe(0);
    expect((await api('get', '/orders?status=paid&search=mama', ada)).body.meta.total).toBe(1);
  });
});

describe('status machine', () => {
  it('vendor: accept → preparing → ready; illegal moves are 409; every step is in the history', async () => {
    const order = await placeOrder();
    expect((await api('post', `/orders/${order.id}/ready`, owner)).body.error.code).toBe('INVALID_STATUS');
    expect((await api('post', `/orders/${order.id}/accept`, owner)).body.data.status).toBe('accepted');
    expect((await api('post', `/orders/${order.id}/accept`, owner)).status).toBe(409);
    await api('post', `/orders/${order.id}/preparing`, owner).expect(200);
    const ready = await api('post', `/orders/${order.id}/ready`, owner);
    expect(ready.body.data.statusHistory.map((h) => [h.status, h.by])).toEqual([
      ['paid', 'system'],
      ['accepted', 'vendor'],
      ['preparing', 'vendor'],
      ['ready_for_pickup', 'vendor'],
    ]);
    // Only the store's vendor moves its orders
    const { owner: rival } = await createPublicVendor();
    expect((await api('post', `/orders/${order.id}/preparing`, rival)).status).toBe(404);
    expect((await api('post', `/orders/${order.id}/accept`, ada)).status).toBe(403);
  });

  it('customer cancels while paid (full refund); CANNOT_CANCEL after acceptance', async () => {
    const order = await placeOrder();
    const res = await api('post', `/orders/${order.id}/cancel`, ada, { reason: 'Ordered twice' });
    expect(res.body.data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Ordered twice',
      payment: { status: 'refunded' },
    });
    expect((await Payment.findOne({ where: { orderId: order.id } })).settlementStatus).toBe('refunded');

    const second = await placeOrder();
    await api('post', `/orders/${second.id}/accept`, owner);
    const late = await api('post', `/orders/${second.id}/cancel`, ada);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('CANNOT_CANCEL');
  });

  it('vendor rejects (reason required, paid or accepted only) and the customer is refunded', async () => {
    const order = await placeOrder();
    expect((await api('post', `/orders/${order.id}/reject`, owner, {})).body.error.fieldErrors).toEqual({
      reason: 'Tell the customer why',
    });
    const res = await api('post', `/orders/${order.id}/reject`, owner, { reason: 'Out of stock' });
    expect(res.body.data).toMatchObject({
      status: 'rejected',
      cancelReason: 'Out of stock',
      payment: { status: 'refunded' },
    });
    expect((await api('get', '/me/payments', ada)).body.data[0].status).toBe('refunded');
  });

  it('accept deadline: the job (or a vendor read) rejects "Not accepted in time" and refunds', async () => {
    const order = await placeOrder();
    expect(await autoReject(order.id)).toEqual({ skipped: true });
    await Order.update({ acceptDeadline: new Date(Date.now() - 1000) }, { where: { id: order.id } });
    const late = await api('post', `/orders/${order.id}/accept`, owner);
    expect(late.status).toBe(409);
    expect(late.body.error.message).toBe('This order was not accepted in time, so the customer was refunded.');
    const row = await Order.findByPk(order.id);
    expect(row).toMatchObject({ status: 'rejected', cancelReason: 'Not accepted in time' });
    expect(row.statusHistory.at(-1)).toMatchObject({ status: 'rejected', by: 'system' });
  });
});

describe('vendor numbers', () => {
  it('stats, sales with summary, daily sales', async () => {
    await placeOrder();
    const cancelled = await placeOrder();
    await api('post', `/orders/${cancelled.id}/cancel`, ada);

    const stats = await api('get', '/vendor/stats?days=7', owner);
    expect(stats.body.data).toMatchObject({ today: { orders: 1, sales: 350000 }, waiting: 1, inProgress: 0 });
    expect(stats.body.data.series).toHaveLength(7);
    expect(stats.body.data.topItems).toEqual([
      { foodItemId: dish.id, name: 'Party jollof rice', quantity: 1, sales: 350000 },
    ]);

    const sales = await api('get', '/vendor/sales', owner);
    expect(sales.body.meta.summary).toEqual({ settling: 350000, settled: 0, refunded: 350000 });
    expect((await api('get', '/vendor/sales?settlementStatus=refunded', owner)).body.meta.total).toBe(1);

    await Payment.update({ paidAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) }, { where: { status: 'success' } });
    expect(await settlePayments()).toEqual({ settled: 1 });
    const daily = await api('get', '/vendor/sales/daily', owner);
    expect(daily.body.data).toEqual([
      expect.objectContaining({ orders: 1, amount: 350000, settled: 350000, settling: 0 }),
    ]);
  });
});

describe('admin customers and payments', () => {
  it('lists customers with order counts and changes their status (reason needed, audited)', async () => {
    await placeOrder();
    const admin = await createUser({ role: 'admin', adminRole: 'super_admin', phone: null });
    const list = await api('get', '/admin/customers?search=okafor', admin);
    expect(list.body.data).toMatchObject([{ id: ada.id, ordersCount: 1, status: 'active' }]);

    expect(
      (await api('post', `/admin/customers/${ada.id}/status`, admin, { status: 'banned' })).body.error.fieldErrors,
    ).toEqual({
      reason: 'Give a reason',
    });
    const banned = await api('post', `/admin/customers/${ada.id}/status`, admin, {
      status: 'banned',
      reason: 'Chargebacks',
    });
    expect(banned.body.data).toEqual({ id: ada.id, status: 'banned' });
    expect((await api('get', '/orders', ada)).body.error.code).toBe('ACCOUNT_BANNED');
    expect(await AuditLog.count({ where: { action: 'customer.banned' } })).toBe(1);
    await api('post', `/admin/customers/${ada.id}/status`, admin, { status: 'active' }).expect(200);
    expect((await User.findByPk(ada.id)).status).toBe('active');
    expect((await api('post', `/admin/customers/${owner.id}/status`, admin, { status: 'active' })).status).toBe(404);
  });

  it('lists payments with the split summary; flagged filter; reconcile clears the flag', async () => {
    const order = await placeOrder();
    const finance = await createUser({ role: 'admin', adminRole: 'finance', phone: null });
    const payment = await Payment.findOne({ where: { orderId: order.id } });
    await payment.update({ flag: 'amount_mismatch' });

    const list = await api('get', '/admin/payments?flagged=true', finance);
    expect(list.body.data).toMatchObject([
      { id: payment.id, orderCode: order.code, vendorName: 'Mama Put Kitchen', flag: 'amount_mismatch' },
    ]);
    expect(list.body.meta.summary).toMatchObject({ amount: payment.amount, vendorShare: 350000, flagged: 1 });

    expect((await api('post', `/admin/payments/${payment.id}/reconcile`, finance, {})).body.error.fieldErrors).toEqual({
      note: 'Say how you checked it',
    });
    const res = await api('post', `/admin/payments/${payment.id}/reconcile`, finance, {
      note: 'Matched the Paystack dashboard',
    });
    expect(res.body.data).toEqual({ id: payment.id, flag: null, reconciled: true });
    expect(await AuditLog.count({ where: { action: 'payment.reconciled' } })).toBe(1);
  });
});
