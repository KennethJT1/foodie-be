import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { addDays, lagosDay, lagosDayStart } from '../../../src/core/utils/index.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createOrderRow, createPublicVendor, createUser } from '../../helpers/factories.js';

const { Order, Refund, Rider } = models;

let admin;
let ada;
let vendor;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  admin = await createUser({ role: 'admin', adminRole: 'finance', phone: null });
  ada = await createUser();
  ({ vendor } = await createPublicVendor());
});

const get = (who, query = '') => request(app).get(`/api/v1/admin/overview${query}`).set('Authorization', bearer(who));

/** An order row created at `at` with `total` (subtotal + fees). */
const orderAt = async (at, overrides = {}) => {
  const order = await createOrderRow({ customer: ada, vendor, ...overrides });
  await Order.update({ createdAt: at }, { where: { id: order.id }, silent: true });
  return order;
};

describe('GET /admin/overview', () => {
  it('sums today against yesterday, live work, revenue, sign-ups and the waiting list', async () => {
    const today = lagosDay();
    const noon = (day) => new Date(lagosDayStart(day).getTime() + 12 * 3600_000);
    const startToday = lagosDayStart(today);
    // Today: two counted orders (₦6,600 each = 500000 + 150000 + 10000) and a cancelled one
    await orderAt(new Date(Math.max(startToday.getTime() + 60_000, Date.now() - 60_000)));
    await orderAt(new Date(Math.max(startToday.getTime() + 60_000, Date.now() - 120_000)), { status: 'paid' });
    await orderAt(new Date(Date.now() - 60_000), { status: 'cancelled' });
    // Yesterday: one
    await orderAt(noon(addDays(today, -1)));
    // Live: one on the road
    const riderUser = await createUser({ role: 'rider', rider: { approvalStatus: 'approved', isOnline: true } });
    const rider = await Rider.findOne({ where: { userId: riderUser.id } });
    await orderAt(new Date(Date.now() - 30_000), { rider, status: 'picked_up' });
    // The store is active on Pro (createPublicVendor), so it pays
    // Waiting: a pending vendor, a pending rider, an escalated refund
    await createUser({ role: 'vendor', vendor: { approvalStatus: 'pending' } });
    await createUser({ role: 'rider', rider: { approvalStatus: 'pending' } });
    const delivered = await createOrderRow({ customer: ada, vendor });
    await Refund.create({
      orderId: delivered.id,
      customerId: ada.id,
      vendorId: vendor.id,
      orderCode: delivered.code,
      customerName: ada.name,
      vendorName: vendor.name,
      reason: 'Food arrived cold',
      amount: 100000,
      orderSubtotal: 500000,
      photos: [],
      status: 'escalated',
      escalated: true,
      deadline: new Date(),
      timeline: [],
      comments: [],
    });

    const res = await get(admin, '?days=3');
    expect(res.status).toBe(200);
    const total = 660000;
    const data = res.body.data;
    expect(data).toMatchObject({
      ordersToday: expect.any(Number),
      activeDeliveries: 1,
      payingVendors: 1,
      onlineRiders: 1,
      pending: { vendors: 1, riders: 1, refunds: 1 },
    });
    // Today: 2 counted + the moving one + the delivered refund order (all created now)
    expect(data.ordersToday).toBe(4);
    expect(data.gmvToday).toBe(4 * total);
    expect(data.ordersChange).toBe(300);
    expect(data.activeOrders).toBe(2);
    // Pro is ₦12,000 a month in the reference plans
    expect(data.mrr).toBe(1_200_000);
    expect(data.deliveryFeeRevenue).toBeGreaterThanOrEqual(150000);
    expect(data.signups.customers).toBeGreaterThanOrEqual(1);
    expect(data.signups.riders).toBe(2);
    expect(data.series).toHaveLength(3);
    expect(data.series.at(-1)).toEqual({ date: today, orders: 4, gmv: 4 * total });
    expect(data.series.at(-2)).toEqual({ date: addDays(today, -1), orders: 1, gmv: total });
  });

  it('days defaults to 14 and is capped at 90; needs dashboard.view', async () => {
    expect((await get(admin)).body.data.series).toHaveLength(14);
    expect((await get(admin, '?days=500')).body.data.series).toHaveLength(90);
    expect((await get(admin)).body.data).toMatchObject({ gmvToday: 0, gmvChange: null, ordersChange: null });
    expect((await get(ada)).status).toBe(403);
  });
});
