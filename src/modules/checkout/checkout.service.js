// Checkout and order payments (FR-ORD-03): initialize prices the cart and starts a Paystack
// transaction with the split; the order exists only once verify (or the webhook) confirms payment.
// Reference: foodie-fe src/mocks/handlers/checkout.js and utils/orders.js (createOrderFromPayment).
import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import { logger } from '../../config/logger.js';
import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { deliveryCode, orderCode, uniqueCode } from '../../core/utils/index.js';
import { models, withTransaction } from '../../db/index.js';
import { paystack, paystackMode } from '../../integrations/paystack/paystack.client.js';
import { emitTo } from '../../realtime/emit.js';
import { rooms } from '../../realtime/rooms.js';
import { notify } from '../notifications/notifications.service.js';
import { loadOrderDetail, scheduleAutoReject } from '../orders/orders.service.js';
import { getSettings } from '../settings/settings.service.js';
import { ensureSubaccount } from '../vendors/adminVendors.service.js';
import { priceCart } from './pricing.service.js';

const { FoodItem, Order, OrderItem, Payment, Vendor } = models;

export const newOrderReference = () => `KJT_${randomBytes(8).toString('hex').toUpperCase()}`;
const payerEmail = (user) => user.email ?? `${user.id}@customers.kjtfoodie.test`;

/** POST /checkout/quote */
export const quote = (user, body) => priceCart(user, body);

/**
 * POST /payments/initialize: re-prices the cart and starts the transaction. Paystack split: the
 * food subtotal goes to the vendor's subaccount; delivery and processing fees stay with KJT Foodie.
 */
export const initializePayment = async (user, body) => {
  const priced = await priceCart(user, body);
  const reference = newOrderReference();
  const email = payerEmail(user);
  const deliveryNote = String(body.deliveryNote ?? '')
    .trim()
    .slice(0, 200);

  let accessCode;
  let flag = null;
  if (paystackMode.live()) {
    const subaccount = await ensureSubaccount(priced.vendor.id);
    // Without a subaccount Paystack can't split; the vendor is then settled by hand (finance sees the flag)
    if (!subaccount) flag = 'no_split';
    ({ accessCode } = await paystack.initializeTransaction({
      email,
      amount: priced.total,
      reference,
      metadata: { type: 'order', vendorId: priced.vendor.id, customerId: user.id },
      subaccount,
      transactionCharge: priced.deliveryFee + priced.processingFee,
    }));
  } else {
    accessCode = randomBytes(6).toString('hex');
  }

  await Payment.create({
    reference,
    type: 'order',
    userId: user.id,
    vendorId: priced.vendor.id,
    amount: priced.total,
    vendorShare: priced.subtotal,
    platformShare: priced.deliveryFee,
    fee: priced.processingFee,
    accessCode,
    flag,
    metadata: { quote: priced, deliveryNote },
  });
  return { reference, accessCode, amount: priced.total, email };
};

/** Paystack's answer for a pending payment; locally a card payment that succeeded. */
const checkWithGateway = async (payment) =>
  paystackMode.live()
    ? paystack.verifyTransaction(payment.reference)
    : { status: 'success', amount: payment.amount, channel: 'card', fee: null, paidAt: new Date() };

const NOT_RECEIVED = "We haven't received this payment yet. If you were charged, it will show here shortly.";

/** Creates the order, its lines and the vendor's notice from a confirmed payment. */
const createOrder = async (payment, tx, transaction) => {
  const { quote: q, deliveryNote } = payment.metadata;
  const [customer, vendor, settings] = await Promise.all([
    models.User.findByPk(payment.userId, { transaction }),
    Vendor.findByPk(q.vendor.id, { transaction }),
    getSettings(),
  ]);
  const paidAt = tx.paidAt ?? new Date();
  const now = new Date();
  const code = await uniqueCode(orderCode, async (c) =>
    Boolean(await Order.findOne({ where: { code: c }, transaction })),
  );
  const order = await Order.create(
    {
      code,
      customerId: customer.id,
      vendorId: vendor.id,
      status: 'paid',
      customerName: customer.name,
      customerPhone: customer.phone,
      vendorName: vendor.name,
      vendorSlug: vendor.slug,
      subtotal: q.subtotal,
      deliveryFee: q.deliveryFee,
      processingFee: q.processingFee,
      total: q.total,
      address: q.address,
      deliveryNote: deliveryNote ?? '',
      scheduledFor: q.scheduledFor,
      deliveryCode: deliveryCode(),
      distanceM: q.distanceM,
      etaMinMins: q.etaMins[0],
      etaMaxMins: q.etaMins[1],
      acceptDeadline: new Date(now.getTime() + settings.vendorAcceptTimeoutSec * 1000),
      statusHistory: [{ status: 'paid', at: now.toISOString(), by: 'system' }],
      paymentReference: payment.reference,
    },
    { transaction },
  );
  await OrderItem.bulkCreate(
    q.lines.map((l, sortOrder) => ({
      orderId: order.id,
      foodItemId: l.foodItemId,
      name: l.name,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      options: l.options,
      lineTotal: l.lineTotal,
      sortOrder,
    })),
    { transaction },
  );
  for (const l of q.lines) {
    await FoodItem.increment('ordersCount', {
      by: l.quantity,
      where: { id: l.foodItemId },
      transaction,
      paranoid: false,
    });
  }
  await payment.update(
    {
      orderId: order.id,
      status: 'success',
      channel: tx.channel ?? 'card',
      ...(tx.fee != null && { fee: tx.fee }),
      paidAt,
      settlementStatus: 'settling',
    },
    { transaction },
  );
  await notify(
    customer.id,
    {
      type: 'order',
      title: 'We got your order',
      body: `Order KJT-${order.code} is with ${vendor.name}.`,
      link: `/account/orders/${order.id}`,
    },
    { transaction },
  );
  await notify(
    vendor.ownerUserId,
    {
      type: 'order',
      title: 'New order',
      body: `Order KJT-${order.code} is waiting. Accept it within ${Math.round(settings.vendorAcceptTimeoutSec / 60)} min.`,
      link: `/vendor/orders/${order.id}`,
    },
    { transaction },
  );
  await audit.log(
    {
      actor: null,
      action: 'payment.received',
      targetType: 'payment',
      targetId: payment.id,
      summary: `KJT-${order.code}: ₦${(payment.amount / 100).toLocaleString('en-NG')} (${payment.reference})`,
    },
    { transaction },
  );
  return order;
};

/**
 * Confirms an order payment and creates the order. Idempotent: POST /payments/verify and the
 * Paystack webhook may both run it, in any order, any number of times. `userId` scopes it for
 * customers (someone else's reference is a 404).
 */
export const confirmOrderPayment = async (reference, { userId } = {}) => {
  const scope = { reference, type: 'order', ...(userId && { userId }) };
  const found = await Payment.findOne({ where: scope });
  if (!found) throw new NotFoundError("We couldn't find that payment.");
  if (found.status === 'success' || found.orderId) return found;

  const tx = await checkWithGateway(found);
  const created = await withTransaction(async (transaction) => {
    const payment = await Payment.findOne({ where: scope, transaction, lock: transaction.LOCK.UPDATE });
    if (payment.orderId) return null;
    if (tx.status !== 'success') {
      if (['failed', 'abandoned'].includes(tx.status)) await payment.update({ status: tx.status }, { transaction });
      throw new ConflictError('INVALID_STATUS', NOT_RECEIVED);
    }
    if (tx.amount !== payment.amount) {
      await payment.update({ flag: 'amount_mismatch' }, { transaction });
      logger.error({ reference, expected: payment.amount, paid: tx.amount }, 'Order payment amount mismatch');
      throw new ConflictError('INVALID_STATUS', NOT_RECEIVED);
    }
    return createOrder(payment, tx, transaction);
  });
  if (created) {
    // The vendor dashboard plays a sound and adds the order to its live queue
    emitTo(rooms.vendor(created.vendorId), 'vendor:order:new', {
      vendorId: created.vendorId,
      orderId: created.id,
      code: created.code,
      total: created.total,
      acceptDeadline: created.acceptDeadline.toISOString(),
    });
    await scheduleAutoReject(created).catch((err) =>
      logger.error({ err, orderId: created.id }, 'Could not schedule auto-reject; vendor reads will sweep it'),
    );
  }
  return Payment.findOne({ where: scope });
};

/** POST /payments/verify: { status: 'success', reference, order }. */
export const verifyPayment = async (user, { reference }) => {
  const payment = await confirmOrderPayment(String(reference ?? ''), { userId: user.id });
  return { status: 'success', reference: payment.reference, order: await loadOrderDetail(payment.orderId, user) };
};

// GET /me/payments (handoff section 3): search reference, order code, vendor name; filter status
const MY_PAYMENTS = {
  searchFields: ['reference', '$order.code$', '$vendor.name$'],
  filters: { status: 'status', channel: 'channel' },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', amount: 'amount' },
  include: [
    { model: Order, as: 'order', attributes: ['id', 'code', 'vendorName'] },
    { model: Vendor, as: 'vendor', attributes: ['id', 'name'], paranoid: false },
  ],
};

/** The customer's order payments; cancelled / rejected orders show as refunded. */
export const listMyPayments = async (user, query) => {
  const listQuery = buildListQuery(query, MY_PAYMENTS, { scope: { userId: user.id, type: 'order' } });
  // A started but unpaid checkout isn't a payment yet
  listQuery.where = { [Op.and]: [listQuery.where, { status: { [Op.ne]: 'pending' } }] };
  const { data, meta } = await paginate(Payment, listQuery);
  return {
    data: data.map((p) => ({
      id: p.id,
      reference: p.reference,
      amount: p.amount,
      channel: p.channel,
      status: p.status,
      orderId: p.orderId,
      orderCode: p.order?.code ?? null,
      vendorName: p.order?.vendorName ?? p.vendor?.name ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    meta,
  };
};
