// Vendor dashboard numbers and sales (BRD section 8, BR-PAY-03/04). Money is the food subtotal, the
// vendor's share of each payment. Days are Lagos days. Reference: foodie-fe
// src/mocks/handlers/vendor-orders.js (stats, sales, daily).
import { fn, col, Op } from 'sequelize';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { models } from '../../db/index.js';
import { ownVendor } from '../vendors/onboarding.service.js';
import { expireOverdueOrders } from './orders.service.js';

const { Order, OrderItem, Payment } = models;

const DAY = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const lagosDay = (date) => new Date(new Date(date).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
const COUNTED = { [Op.notIn]: ['cancelled', 'rejected'] };
const clampDays = (value, fallback) => Math.min(90, Math.max(1, Number.parseInt(value, 10) || fallback));
const change = (now, before) => (before ? ((now - before) / before) * 100 : null);

/** GET /vendor/stats?days=14 */
export const stats = async (user, query) => {
  const vendor = await ownVendor(user);
  await expireOverdueOrders(vendor.id);
  const days = clampDays(query.days, 14);
  // Enough history for the series and for yesterday
  const since = new Date(Date.now() - Math.max(days, 2) * DAY);
  const [recent, waiting, inProgress] = await Promise.all([
    Order.findAll({
      where: { vendorId: vendor.id, status: COUNTED, createdAt: { [Op.gte]: since } },
      attributes: ['id', 'subtotal', 'createdAt'],
      include: [{ model: OrderItem, as: 'items', attributes: ['foodItemId', 'name', 'quantity', 'lineTotal'] }],
    }),
    Order.count({ where: { vendorId: vendor.id, status: 'paid' } }),
    Order.count({
      where: { vendorId: vendor.id, status: ['accepted', 'preparing', 'ready_for_pickup', 'rider_assigned'] },
    }),
  ]);
  const byDay = new Map();
  for (const o of recent) {
    const day = lagosDay(o.createdAt);
    const d = byDay.get(day) ?? { orders: 0, sales: 0 };
    d.orders += 1;
    d.sales += o.subtotal;
    byDay.set(day, d);
  }
  const today = byDay.get(lagosDay(Date.now())) ?? { orders: 0, sales: 0 };
  const yesterday = byDay.get(lagosDay(Date.now() - DAY)) ?? { orders: 0, sales: 0 };

  const seriesStart = Date.now() - days * DAY;
  const tally = new Map();
  for (const o of recent) {
    if (o.createdAt.getTime() < seriesStart) continue;
    for (const l of o.items) {
      const t = tally.get(l.foodItemId) ?? { foodItemId: l.foodItemId, name: l.name, quantity: 0, sales: 0 };
      t.quantity += l.quantity;
      t.sales += l.lineTotal;
      tally.set(l.foodItemId, t);
    }
  }
  return {
    today: {
      orders: today.orders,
      sales: today.sales,
      ordersChange: change(today.orders, yesterday.orders),
      salesChange: change(today.sales, yesterday.sales),
    },
    waiting,
    inProgress,
    rating: vendor.rating,
    ratingCount: vendor.ratingCount,
    followersCount: vendor.followersCount,
    isPaused: vendor.isPaused,
    series: Array.from({ length: days }, (_, i) => {
      const date = lagosDay(Date.now() - (days - 1 - i) * DAY);
      const d = byDay.get(date) ?? { orders: 0, sales: 0 };
      return { date, orders: d.orders, sales: d.sales };
    }),
    topItems: [...tally.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
  };
};

// GET /vendor/sales (handoff section 3): search order code, customer, reference
const SALES_LIST = {
  searchFields: ['reference', '$order.code$', '$order.customer_name$'],
  filters: { settlementStatus: 'settlementStatus' },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', amount: 'vendorShare' },
  include: [{ model: Order, as: 'order', attributes: ['id', 'code', 'customerName'] }],
};

/** GET /vendor/sales: food money per order; meta.summary over the whole filtered range. */
export const sales = async (user, query) => {
  const vendor = await ownVendor(user);
  const listQuery = buildListQuery(query, SALES_LIST, {
    scope: { vendorId: vendor.id, type: 'order', status: ['success', 'refunded'] },
  });
  const { data, meta } = await paginate(Payment, listQuery);
  const totals = await Payment.findAll({
    where: listQuery.where,
    include: SALES_LIST.include.map((i) => ({ ...i, attributes: [] })),
    attributes: ['settlementStatus', [fn('SUM', col('vendor_share')), 'amount']],
    group: ['settlementStatus'],
    raw: true,
  });
  const sum = (status) => Number(totals.find((t) => t.settlementStatus === status)?.amount ?? 0);
  return {
    data: data.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      orderCode: p.order?.code ?? '',
      customerName: p.order?.customerName ?? '',
      amount: p.vendorShare,
      status: p.status,
      settlementStatus: p.settlementStatus,
      reference: p.reference,
      createdAt: p.createdAt.toISOString(),
    })),
    meta: { ...meta, summary: { settling: sum('settling'), settled: sum('settled'), refunded: sum('refunded') } },
  };
};

/** GET /vendor/sales/daily?days=30: [{ date, orders, amount, settling, settled }], newest first. */
export const dailySales = async (user, query) => {
  const vendor = await ownVendor(user);
  const days = clampDays(query.days, 30);
  const payments = await Payment.findAll({
    where: {
      vendorId: vendor.id,
      type: 'order',
      status: 'success',
      createdAt: { [Op.gte]: new Date(Date.now() - days * DAY) },
    },
    attributes: ['vendorShare', 'settlementStatus', 'createdAt'],
  });
  const byDay = new Map();
  for (const p of payments) {
    const date = lagosDay(p.createdAt);
    const d = byDay.get(date) ?? { date, orders: 0, amount: 0, settling: 0, settled: 0 };
    d.orders += 1;
    d.amount += p.vendorShare;
    d[p.settlementStatus === 'settled' ? 'settled' : 'settling'] += p.vendorShare;
    byDay.set(date, d);
  }
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
};
