// GET /admin/overview (BRD section 8, admin dashboard): today's GMV and orders against yesterday,
// live work, MRR, this month's delivery-fee revenue, sign-ups, what is waiting on the team and a
// daily series. Reference: foodie-fe src/mocks/handlers/admin.js (overview).
import { Op, fn, col, literal } from 'sequelize';
import { addDays, DAY_MS, lagosDay, lagosDayStart } from '../../core/utils/index.js';
import { models } from '../../db/index.js';
import { ACTIVE_ORDER_STATUSES } from '../../db/models/order.model.js';
import { getSettings } from '../settings/settings.service.js';
import { yearlyPriceOf } from '../subscriptions/plans.service.js';

const { Order, Plan, Refund, Rider, Subscription, User, Vendor } = models;

// Cancelled and rejected orders were refunded in full: they are not sales
const COUNTED = { status: { [Op.notIn]: ['cancelled', 'rejected'] } };
const MAX_DAYS = 90;
// Lagos is UTC+1 all year
const lagosDate = literal('DATE(DATE_ADD(`created_at`, INTERVAL 1 HOUR))');

const change = (now, before) => (before ? ((now - before) / before) * 100 : null);

/** Orders and GMV per Lagos day from `firstDay` on: Map day → { orders, gmv }. */
const dailyTotals = async (firstDay) => {
  const rows = await Order.findAll({
    where: { ...COUNTED, createdAt: { [Op.gte]: lagosDayStart(firstDay) } },
    attributes: [
      [lagosDate, 'day'],
      [fn('COUNT', col('id')), 'orders'],
      [fn('COALESCE', fn('SUM', col('total')), 0), 'gmv'],
    ],
    group: [lagosDate],
    raw: true,
  });
  // DATE comes back as a string or a Date depending on the driver
  const key = (day) => (day instanceof Date ? day.toISOString().slice(0, 10) : String(day).slice(0, 10));
  return new Map(rows.map((r) => [key(r.day), { orders: Number(r.orders), gmv: Number(r.gmv) }]));
};

/** Monthly recurring revenue from vendors on a paid plan (active or in grace); yearly plans count 1/12. */
const recurringRevenue = async (settings) => {
  const vendors = await Vendor.findAll({
    where: { subscriptionStatus: ['active', 'grace'] },
    attributes: ['id', 'planId'],
    include: [{ model: Subscription, as: 'subscription', attributes: ['planId', 'interval'] }],
  });
  const plans = new Map((await Plan.findAll()).map((p) => [p.id, p]));
  const mrr = vendors.reduce((sum, v) => {
    const plan = plans.get(v.subscription?.planId ?? v.planId);
    if (!plan) return sum;
    return (
      sum + (v.subscription?.interval === 'yearly' ? Math.round(yearlyPriceOf(plan, settings) / 12) : plan.monthlyPrice)
    );
  }, 0);
  return { mrr, payingVendors: vendors.length };
};

/** GET /admin/overview?days=14 (1–90). */
export const overview = async (query = {}) => {
  const days = Math.min(MAX_DAYS, Math.max(1, Math.floor(Number(query.days)) || 14));
  const now = new Date();
  const today = lagosDay(now);
  const yesterday = addDays(today, -1);
  const firstDay = addDays(today, -(Math.max(days, 2) - 1));
  const monthStart = lagosDayStart(`${today.slice(0, 7)}-01`);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const settings = await getSettings();

  const signups = (role) => User.count({ where: { role, createdAt: { [Op.gte]: weekAgo } } });
  const [
    totals,
    activeDeliveries,
    activeOrders,
    revenue,
    deliveryFeeRevenue,
    customers,
    vendors,
    riders,
    onlineRiders,
    pendingVendors,
    pendingRiders,
    pendingRefunds,
  ] = await Promise.all([
    dailyTotals(firstDay),
    Order.count({ where: { status: ['rider_assigned', 'picked_up'] } }),
    Order.count({ where: { status: ACTIVE_ORDER_STATUSES } }),
    recurringRevenue(settings),
    Order.sum('deliveryFee', { where: { status: 'delivered', createdAt: { [Op.gte]: monthStart } } }),
    signups('customer'),
    signups('vendor'),
    signups('rider'),
    Rider.count({ where: { isOnline: true } }),
    Vendor.count({ where: { approvalStatus: 'pending' } }),
    Rider.count({ where: { approvalStatus: 'pending' } }),
    Refund.count({ where: { status: ['disputed', 'escalated'] } }),
  ]);

  const on = (day) => totals.get(day) ?? { orders: 0, gmv: 0 };
  const t = on(today);
  const y = on(yesterday);
  return {
    gmvToday: t.gmv,
    gmvChange: change(t.gmv, y.gmv),
    ordersToday: t.orders,
    ordersChange: change(t.orders, y.orders),
    activeDeliveries,
    activeOrders,
    mrr: revenue.mrr,
    payingVendors: revenue.payingVendors,
    deliveryFeeRevenue: Number(deliveryFeeRevenue ?? 0),
    signups: { customers, vendors, riders },
    onlineRiders,
    pending: { vendors: pendingVendors, riders: pendingRiders, refunds: pendingRefunds },
    series: Array.from({ length: days }, (_, i) => {
      const date = addDays(today, i - (days - 1));
      return { date, ...on(date) };
    }),
  };
};
