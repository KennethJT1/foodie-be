// Orders and their payments (handoff 8.4): 360 over the last 90 days (Mama Put weighted ×3, Ada ×2;
// delivered 20 : cancelled 1.2 : rejected 1), today's live queue at Mama Put, 26 more live orders at
// other stores, Ada's order on its way with a rider, and 24 delivered trips for Tunde. Payments:
// card 60% / transfer 30% / USSD 10%, settled after 1.5 days, about 1.5% flagged, refunded when the
// order was cancelled or rejected.
// Deliveries, reviews and refunds come with their phases.
import { seedId } from '../ids.js';
import { Op } from 'sequelize';
import { haversineM } from '../../../core/utils/index.js';
import { deliveryFeeFor, etaFor, processingFeeFor } from '../../../modules/checkout/pricing.service.js';
import { DEFAULT_SETTINGS } from '../../../modules/settings/settings.defaults.js';
import { models, newId } from '../../index.js';
import { ORDER_FLOW } from '../../models/order.model.js';

const { Address, FoodItem, Order, OrderItem, Payment, Rider, User, Vendor } = models;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RIDER_STEPS = ['rider_assigned', 'picked_up', 'delivered'];
const NOTES = [
  'Call when you get to the gate',
  'Please add extra pepper',
  'Leave with the security man',
  'Blue gate opposite the church',
];

export const orders = async ({ transaction, faker, now }) => {
  const s = DEFAULT_SETTINGS;
  const vendors = await Vendor.findAll({
    where: { approvalStatus: 'approved', subscriptionStatus: { [Op.ne]: 'expired' } },
    order: [['id', 'ASC']],
    transaction,
  });
  const menu = new Map(vendors.map((v) => [v.id, []]));
  for (const f of await FoodItem.findAll({
    where: { vendorId: vendors.map((v) => v.id) },
    order: [['id', 'ASC']],
    transaction,
  })) {
    menu.get(f.vendorId).push(f);
  }
  const customers = await User.findAll({ where: { role: 'customer' }, order: [['id', 'ASC']], transaction });
  const ada = customers.find((c) => c.id === seedId('usr_customer_ada'));
  const addressOf = new Map(
    (await Address.findAll({ where: { isDefault: true }, transaction })).map((a) => [a.userId, a]),
  );
  const riders = await Rider.findAll({ where: { approvalStatus: 'approved' }, order: [['id', 'ASC']], transaction });
  const ridersIn = (city) => riders.filter((r) => r.city === city && r.id !== seedId('rid_tunde'));
  const mamaPut = vendors.find((v) => v.id === seedId('ven_mama_put'));
  const usedCodes = new Set();
  const ordersCount = new Map();
  const trips = new Map();
  const rows = { orders: [], items: [], payments: [] };

  const lines = (vendorId) =>
    faker.helpers
      .arrayElements(menu.get(vendorId), faker.number.int({ min: 1, max: Math.min(3, menu.get(vendorId).length) }))
      .map((f, sortOrder) => {
        const options = [];
        for (const g of f.optionGroups) {
          if (g.required || faker.datatype.boolean(0.3)) {
            const o = faker.helpers.arrayElement(g.options);
            options.push({ groupId: g.id, groupName: g.name, optionId: o.id, name: o.name, price: o.price });
          }
        }
        const quantity = faker.number.int({ min: 1, max: 3 });
        ordersCount.set(f.id, (ordersCount.get(f.id) ?? 0) + quantity);
        return {
          foodItemId: f.id,
          name: f.name,
          unitPrice: f.price,
          quantity,
          options,
          lineTotal: (f.price + options.reduce((sum, o) => sum + o.price, 0)) * quantity,
          sortOrder,
        };
      });

  const code = () => {
    let c;
    do c = Array.from({ length: 6 }, () => faker.helpers.arrayElement([...CODE_ALPHABET])).join('');
    while (usedCodes.has(c));
    usedCodes.add(c);
    return c;
  };

  const createOrder = ({ customer, vendor, status, createdAt, riderId }) => {
    if (!menu.get(vendor.id)?.length) return;
    const home = addressOf.get(customer.id);
    const address = {
      label: home.label,
      line1: home.line1,
      area: home.area,
      city: home.city,
      state: home.state,
      lat: home.lat,
      lng: home.lng,
    };
    const distanceM = Math.max(800, Math.min(haversineM(vendor, address), 14_000 + faker.number.int(4000)));
    const items = lines(vendor.id);
    const subtotal = items.reduce((sum, l) => sum + l.lineTotal, 0);
    const deliveryFee = deliveryFeeFor(distanceM, s);
    const processingFee = processingFeeFor(subtotal + deliveryFee, s);
    const created = createdAt.getTime();
    const path =
      status === 'rejected' || status === 'cancelled'
        ? ['paid', status]
        : ORDER_FLOW.slice(0, ORDER_FLOW.indexOf(status) + 1);
    let at = created;
    const statusHistory = path.map((step, i) => {
      if (i) at += faker.number.int({ min: 3, max: 12 }) * MINUTE;
      const by =
        i === 0 ? 'system' : step === 'cancelled' ? 'customer' : RIDER_STEPS.includes(step) ? 'rider' : 'vendor';
      return { status: step, at: new Date(at).toISOString(), by };
    });
    const rider = RIDER_STEPS.includes(status)
      ? (riderId ?? faker.helpers.arrayElement(ridersIn(vendor.city).length ? ridersIn(vendor.city) : riders).id)
      : null;
    if (status === 'delivered' && rider) trips.set(rider, (trips.get(rider) ?? 0) + 1);
    const id = newId();
    const reference = `KJT_${faker.string.alphanumeric({ length: 16, casing: 'upper' })}`;
    const refunded = ['cancelled', 'rejected'].includes(status);
    rows.orders.push({
      id,
      code: code(),
      customerId: customer.id,
      vendorId: vendor.id,
      riderId: rider,
      status,
      customerName: customer.name,
      customerPhone: customer.phone,
      vendorName: vendor.name,
      vendorSlug: vendor.slug,
      subtotal,
      deliveryFee,
      processingFee,
      total: subtotal + deliveryFee + processingFee,
      address,
      deliveryNote: faker.helpers.maybe(() => faker.helpers.arrayElement(NOTES), { probability: 0.4 }) ?? '',
      deliveryCode: faker.string.numeric(4),
      distanceM,
      etaMinMins: etaFor(vendor.prepTimeMins, distanceM)[0],
      etaMaxMins: etaFor(vendor.prepTimeMins, distanceM)[1],
      acceptDeadline: new Date(created + s.vendorAcceptTimeoutSec * 1000),
      statusHistory,
      cancelReason:
        status === 'cancelled'
          ? 'Changed my mind'
          : status === 'rejected'
            ? faker.helpers.arrayElement(['Out of stock', 'Kitchen closing', 'Too busy right now'])
            : null,
      paymentReference: reference,
      createdAt,
      updatedAt: new Date(at),
    });
    rows.items.push(...items.map((l) => ({ ...l, orderId: id, createdAt, updatedAt: createdAt })));
    const ageDays = (now - created) / DAY;
    rows.payments.push({
      reference,
      type: 'order',
      userId: customer.id,
      vendorId: vendor.id,
      orderId: id,
      amount: subtotal + deliveryFee + processingFee,
      vendorShare: subtotal,
      platformShare: deliveryFee,
      fee: processingFee,
      channel: faker.helpers.weightedArrayElement([
        { weight: 6, value: 'card' },
        { weight: 3, value: 'bank_transfer' },
        { weight: 1, value: 'ussd' },
      ]),
      status: refunded ? 'refunded' : 'success',
      settlementStatus: refunded ? 'refunded' : ageDays > 1.5 ? 'settled' : 'settling',
      settledAt: !refunded && ageDays > 1.5 ? new Date(created + DAY) : null,
      refundedAt: refunded ? new Date(at) : null,
      reconciled: ageDays > 1,
      flag:
        faker.helpers.maybe(() => faker.helpers.arrayElement(['amount_mismatch', 'missing_webhook']), {
          probability: 0.015,
        }) ?? null,
      paidAt: createdAt,
      createdAt,
    });
  };

  // History across the last 90 days
  for (let i = 0; i < 360; i += 1) {
    createOrder({
      vendor: faker.helpers.weightedArrayElement([
        { weight: 3, value: mamaPut },
        ...vendors.map((v) => ({ weight: 1, value: v })),
      ]),
      customer: faker.helpers.weightedArrayElement([
        { weight: 2, value: ada },
        ...customers.filter((c) => c !== ada).map((c) => ({ weight: 1, value: c })),
      ]),
      status: faker.helpers.weightedArrayElement([
        { weight: 20, value: 'delivered' },
        { weight: 1.2, value: 'cancelled' },
        { weight: 1, value: 'rejected' },
      ]),
      createdAt: faker.date.between({ from: now - 90 * DAY, to: now - 3 * 60 * MINUTE }),
    });
  }
  // Mama Put's live queue today, and Ada's order on its way (live tracking demo)
  const others = customers.filter((c) => c !== ada && c.status === 'active');
  const minsAgo = (m) => new Date(now - m * MINUTE);
  const lagosRiders = ridersIn('Lagos');
  for (const [i, status, mins] of [
    [3, 'paid', 1],
    [8, 'paid', 2],
    [5, 'accepted', 7],
    [12, 'preparing', 14],
    [15, 'ready_for_pickup', 26],
    [20, 'rider_assigned', 34],
  ]) {
    createOrder({
      customer: others[i],
      vendor: mamaPut,
      status,
      createdAt: minsAgo(mins),
      riderId: lagosRiders[3]?.id,
    });
  }
  createOrder({
    customer: ada,
    vendor: mamaPut,
    status: 'picked_up',
    createdAt: minsAgo(38),
    riderId: lagosRiders[2]?.id,
  });
  // Tunde's delivered trips (Lagos stores)
  const lagosVendors = vendors.filter((v) => v.city === 'Lagos');
  for (let i = 0; i < 24; i += 1) {
    createOrder({
      customer: faker.helpers.arrayElement(customers),
      vendor: faker.helpers.arrayElement(lagosVendors),
      status: 'delivered',
      createdAt: faker.date.between({ from: now - 75 * DAY, to: now - 4 * 60 * MINUTE }),
      riderId: seedId('rid_tunde'),
    });
  }

  // 26 more live orders today at other stores (handoff 8.4). Ages keep every step in the past and
  // paid ones inside the accept window; each moving order gets its own free rider.
  const AGES = {
    paid: [1, 4],
    accepted: [15, 30],
    preparing: [30, 50],
    ready_for_pickup: [45, 70],
    rider_assigned: [60, 90],
    picked_up: [75, 110],
  };
  const busy = new Set([lagosRiders[2]?.id, lagosRiders[3]?.id].filter(Boolean));
  const otherStores = vendors.filter((v) => v.id !== mamaPut.id && menu.get(v.id)?.length);
  for (let i = 0; i < 26; i += 1) {
    const vendor = faker.helpers.arrayElement(otherStores);
    let status = faker.helpers.arrayElement(Object.keys(AGES));
    let riderId;
    if (RIDER_STEPS.includes(status)) {
      riderId = ridersIn(vendor.city).find((r) => !busy.has(r.id))?.id;
      // No free rider in that city: it waits for one instead
      if (riderId) busy.add(riderId);
      else status = 'ready_for_pickup';
    }
    const [min, max] = AGES[status];
    createOrder({
      customer: faker.helpers.arrayElement(others),
      vendor,
      status,
      createdAt: minsAgo(faker.number.int({ min, max })),
      riderId,
    });
  }

  await Order.bulkCreate(rows.orders, { transaction });
  await OrderItem.bulkCreate(rows.items, { transaction });
  await Payment.bulkCreate(rows.payments, { transaction });
  // Counters on dishes and riders
  const caseSql = (pairs, column) =>
    `CASE id ${pairs.map(([id, n]) => `WHEN ${Order.sequelize.escape(id)} THEN ${column} + ${Number(n)}`).join(' ')} ELSE ${column} END`;
  if (ordersCount.size) {
    await FoodItem.update(
      { ordersCount: Order.sequelize.literal(caseSql([...ordersCount], 'orders_count')) },
      { where: { id: [...ordersCount.keys()] }, transaction, paranoid: false },
    );
  }
  if (trips.size) {
    await Rider.update(
      { tripsCount: Order.sequelize.literal(caseSql([...trips], 'trips_count')) },
      { where: { id: [...trips.keys()] }, transaction },
    );
  }
};
