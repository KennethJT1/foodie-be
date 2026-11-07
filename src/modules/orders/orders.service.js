// Orders (BRD section 7): scoped reads, the status machine, cancellation, vendor actions, refunds
// and the accept deadline. Reference: foodie-fe src/mocks/handlers/orders.js, vendor-orders.js
// and utils/orders.js.
import { Op } from 'sequelize';
import { logger } from '../../config/logger.js';
import { permissionsFor } from '../../core/auth/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { addJob, getQueue, jobId } from '../../core/queue/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { ACTIVE_ORDER_STATUSES } from '../../db/models/order.model.js';
import { paystack, paystackMode } from '../../integrations/paystack/paystack.client.js';
import { emitAfterCommit } from '../../realtime/emit.js';
import { rooms } from '../../realtime/rooms.js';
import { notify } from '../notifications/notifications.service.js';
import { toAddressDto } from '../vendors/vendors.presenter.js';

const { FoodItem, Order, OrderItem, Payment, Rider, User, Vendor } = models;

/** What the customer is told at each step (the frontend's ORDER_STATUS_META.customer). */
const CUSTOMER_LINE = {
  paid: 'Waiting for the vendor to accept',
  accepted: 'The vendor has your order',
  rejected: "The vendor couldn't take this order. You'll be refunded in full.",
  preparing: 'Your food is being prepared',
  ready_for_pickup: 'Ready — finding a rider',
  rider_assigned: 'A rider is heading to the vendor',
  picked_up: 'Your food is on the way',
  delivered: 'Delivered. Enjoy your meal',
  cancelled: 'This order was cancelled',
};

const iso = (date) => (date ? new Date(date).toISOString() : null);

// ── Shapes ───────────────────────────────────────────────────────────────────

const toLineDto = (l, photos) => ({
  foodItemId: l.foodItemId,
  name: l.name,
  photo: photos.get(l.foodItemId) ?? null,
  unitPrice: l.unitPrice,
  quantity: l.quantity,
  options: l.options,
  lineTotal: l.lineTotal,
});

/** Current photo of each dish on the orders (a deleted dish keeps its photo). */
const photosFor = async (orders) => {
  const ids = [...new Set(orders.flatMap((o) => (o.items ?? []).map((l) => l.foodItemId)))];
  if (!ids.length) return new Map();
  const items = await FoodItem.findAll({ where: { id: ids }, attributes: ['id', 'photos'], paranoid: false });
  return new Map(items.map((f) => [f.id, f.photos?.[0] ?? null]));
};

/**
 * Order (contract). `items` must be loaded. The delivery code goes only to the customer and
 * admins; the rider asks the customer for it.
 */
export const toOrderDto = (o, viewer, photos = new Map()) => {
  const lines = [...(o.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const dto = {
    id: o.id,
    code: o.code,
    status: o.status,
    customerId: o.customerId,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    vendorId: o.vendorId,
    vendorName: o.vendorName,
    vendorSlug: o.vendorSlug,
    riderId: o.riderId,
    riderName: o.rider?.user?.name ?? null,
    items: lines.map((l) => toLineDto(l, photos)),
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    processingFee: o.processingFee,
    total: o.total,
    address: o.address,
    deliveryNote: o.deliveryNote,
    scheduledFor: iso(o.scheduledFor),
    deliveryCode: o.deliveryCode,
    distanceM: o.distanceM,
    etaMins: [o.etaMinMins, o.etaMaxMins],
    acceptDeadline: iso(o.acceptDeadline),
    isActive: ACTIVE_ORDER_STATUSES.includes(o.status),
    statusHistory: o.statusHistory,
    cancelReason: o.cancelReason,
    ratedVendor: o.ratedVendor,
    ratedRider: o.ratedRider,
    paymentReference: o.paymentReference,
    createdAt: iso(o.createdAt),
    updatedAt: iso(o.updatedAt),
  };
  if (!['customer', 'admin'].includes(viewer?.role)) delete dto.deliveryCode;
  return dto;
};

const DETAIL_INCLUDE = [
  { model: OrderItem, as: 'items' },
  {
    model: Rider,
    as: 'rider',
    include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'phone'] }],
  },
  { model: Vendor, as: 'vendor', paranoid: false },
  { model: Payment, as: 'payment' },
];

/** The order's rider as the detail (and `order:status`) shows it; null before one is assigned. */
const toOrderRiderDto = (r) =>
  r
    ? {
        id: r.id,
        name: r.user?.name ?? '',
        phone: r.user?.phone ?? null,
        vehicleType: r.vehicleType,
        plateNumber: r.plateNumber,
        rating: r.rating,
        lat: r.lat,
        lng: r.lng,
      }
    : null;

/** The detail: order plus vendor, rider, delivery (phase 17), payment and refund (phase 19). */
export const toOrderDetailDto = async (o, viewer) => {
  const v = o.vendor;
  const r = o.rider;
  const p = o.payment;
  return {
    ...toOrderDto(o, viewer, await photosFor([o])),
    vendor: v && {
      id: v.id,
      name: v.name,
      slug: v.slug,
      logo: v.logoUrl,
      phone: v.phone,
      lat: v.lat,
      lng: v.lng,
      address: toAddressDto(v),
    },
    rider: toOrderRiderDto(r),
    delivery: null,
    payment: p && {
      reference: p.reference,
      channel: p.channel,
      status: p.status,
      amount: p.amount,
      createdAt: iso(p.createdAt),
    },
    refund: null,
  };
};

export const loadOrderDetail = async (id, viewer, { transaction } = {}) =>
  toOrderDetailDto(await Order.findByPk(id, { include: DETAIL_INCLUDE, transaction }), viewer);

// ── Scope ────────────────────────────────────────────────────────────────────

/**
 * Which orders the caller may see (handoff section 3, scoped lists): customers their own, vendors
 * their store's, riders their trips, admins with orders.view everything.
 */
export const orderScope = async (user) => {
  if (user.role === 'customer') return { customerId: user.id };
  if (user.role === 'vendor') {
    const vendor = await Vendor.findOne({ where: { ownerUserId: user.id }, attributes: ['id'] });
    return { vendorId: vendor?.id ?? '' };
  }
  if (user.role === 'rider') {
    const rider = await Rider.findOne({ where: { userId: user.id }, attributes: ['id'] });
    return { riderId: rider?.id ?? '' };
  }
  if (user.role === 'admin' && (await permissionsFor(user)).includes('orders.view')) return {};
  throw new ForbiddenError();
};

// GET /orders (handoff section 3): search code, vendor name, customer name
const ORDER_LIST = {
  searchFields: ['code', 'vendorName', 'customerName'],
  filters: {
    status: 'status',
    vendorId: 'vendorId',
    customerId: 'customerId',
    riderId: 'riderId',
    active: ([value]) =>
      value === 'true'
        ? { status: ACTIVE_ORDER_STATUSES }
        : value === 'false'
          ? { status: { [Op.notIn]: ACTIVE_ORDER_STATUSES } }
          : undefined,
  },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', updatedAt: 'updatedAt', total: 'total', status: 'status' },
};

/** GET /orders */
export const listOrders = async (user, query) => {
  const scope = await orderScope(user);
  if (scope.vendorId) await expireOverdueOrders(scope.vendorId);
  const listQuery = buildListQuery(query, ORDER_LIST, { scope });
  // hasMany items are fetched separately so `limit` applies to orders
  const { data, meta } = await paginate(Order, listQuery, {
    include: [
      { model: Rider, as: 'rider', include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }] },
    ],
  });
  const items = data.length ? await OrderItem.findAll({ where: { orderId: data.map((o) => o.id) } }) : [];
  for (const o of data) o.items = items.filter((l) => l.orderId === o.id);
  const photos = await photosFor(data);
  return { data: data.map((o) => toOrderDto(o, user, photos)), meta };
};

const NOT_FOUND = "We couldn't find that order.";

/** GET /orders/{id}: someone else's order is a 404, never a 403. */
export const getOrder = async (user, id) => {
  const scope = await orderScope(user);
  if (scope.vendorId) await expireOverdueOrders(scope.vendorId);
  const order = await Order.findOne({ where: { id, ...scope }, include: DETAIL_INCLUDE });
  if (!order) throw new NotFoundError(NOT_FOUND);
  return toOrderDetailDto(order, user);
};

// ── Status machine ───────────────────────────────────────────────────────────

/** Moves the order on, appends { status, at, by, note? } and tells the customer. */
export const transition = async (order, status, { by, note, transaction, fields = {} }) => {
  const at = new Date();
  await order.update(
    {
      ...fields,
      status,
      statusHistory: [...order.statusHistory, { status, at: at.toISOString(), by, ...(note && { note }) }],
    },
    { transaction },
  );
  await notify(
    order.customerId,
    {
      type: 'order',
      title: CUSTOMER_LINE[status],
      body: `Order KJT-${order.code}`,
      link: `/account/orders/${order.id}`,
    },
    { transaction },
  );
  emitAfterCommit(transaction, rooms.order(order.id), 'order:status', () => orderStatusPayload(order.id));
};

/**
 * `order:status` (handoff section 5): { orderId, status, statusHistory, updatedAt, rider?, delivery? }.
 * Read after commit, so subscribers see exactly what GET /orders/{id} returns.
 */
export const orderStatusPayload = async (orderId) => {
  const o = await Order.findByPk(orderId, {
    include: [
      {
        model: Rider,
        as: 'rider',
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'phone'] }],
      },
    ],
  });
  const rider = toOrderRiderDto(o.rider);
  return {
    orderId: o.id,
    status: o.status,
    statusHistory: o.statusHistory,
    updatedAt: iso(o.updatedAt),
    ...(rider && { rider }),
    // delivery joins in phase 17
  };
};

/**
 * Marks the order's payment refunded (rejections and cancellations are refunded in full). With
 * Paystack live, the refund is requested after commit; a failure flags the payment for finance.
 */
const refundPayment = async (order, transaction) => {
  const payment = await Payment.findOne({ where: { orderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
  if (!payment || payment.status !== 'success') return;
  await payment.update({ status: 'refunded', settlementStatus: 'refunded', refundedAt: new Date() }, { transaction });
  if (paystackMode.live()) {
    transaction.afterCommit(() =>
      paystack.refund({ reference: payment.reference }).catch(async (err) => {
        logger.error({ err, reference: payment.reference }, 'Paystack refund failed');
        await payment.update({ flag: 'refund_failed' }).catch(() => {});
      }),
    );
  }
};

/** Rejects (vendor or the accept deadline) and refunds in full. */
const rejectOrder = async (order, reason, by, transaction) => {
  await transition(order, 'rejected', { by, note: reason, transaction, fields: { cancelReason: reason } });
  await refundPayment(order, transaction);
  // The customer was told by transition(); the notification body carries the reason
};

/**
 * BR-PAY-04: paid orders past their acceptDeadline become rejected ("Not accepted in time") and are
 * refunded. The delayed `order.autoReject` job does this; vendor reads also sweep in case the
 * worker was down.
 */
export const expireOverdueOrders = async (vendorId) => {
  const overdue = await Order.findAll({
    where: { vendorId, status: 'paid', acceptDeadline: { [Op.lte]: new Date() } },
    attributes: ['id'],
  });
  for (const { id } of overdue) await autoReject(id);
  return overdue.length;
};

/** Job `dispatch:order.autoReject` (and the read-time sweep). Safe to run twice. */
export const autoReject = async (orderId) =>
  withTransaction(async (transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order || order.status !== 'paid' || order.acceptDeadline > new Date()) return { skipped: true };
    await rejectOrder(order, 'Not accepted in time', 'system', transaction);
    return { rejected: order.id };
  });

/** Queues the accept-deadline job; the vendor accepting first makes it a no-op (and removes it). */
export const scheduleAutoReject = (order) =>
  addJob(
    'dispatch',
    'order.autoReject',
    { orderId: order.id },
    { jobId: jobId('autoReject', order.id), delay: Math.max(0, order.acceptDeadline.getTime() - Date.now()) },
  );

const cancelAutoReject = (orderId) =>
  getQueue('dispatch')
    .remove(jobId('autoReject', orderId))
    .catch(() => {});

/** POST /orders/{id}/cancel: customers, only while paid (409 CANNOT_CANCEL); full refund. */
export const cancelOrder = async (user, id, { reason } = {}) => {
  await withTransaction(async (transaction) => {
    const order = await lockForUpdate(Order, id, transaction, { where: { customerId: user.id }, message: NOT_FOUND });
    if (order.status !== 'paid') {
      throw new ConflictError(
        'CANNOT_CANCEL',
        'The vendor has already accepted this order, so it can’t be cancelled here. Contact support for help.',
      );
    }
    const why =
      String(reason ?? '')
        .trim()
        .slice(0, 200) || 'Cancelled by customer';
    await transition(order, 'cancelled', { by: 'customer', transaction, fields: { cancelReason: why } });
    await refundPayment(order, transaction);
    const vendor = await Vendor.findByPk(order.vendorId, { transaction });
    await notify(
      vendor?.ownerUserId,
      {
        type: 'order',
        title: 'Order cancelled',
        body: `The customer cancelled order KJT-${order.code}.`,
        link: `/vendor/orders/${order.id}`,
      },
      { transaction },
    );
  });
  await cancelAutoReject(id);
  return loadOrderDetail(id, user);
};

/** Vendor moves: which status each needs first (BRD section 7). */
const VENDOR_MOVES = {
  accept: { from: 'paid', to: 'accepted', done: 'accepted' },
  preparing: { from: 'accepted', to: 'preparing', done: 'marked as preparing' },
  ready: { from: 'preparing', to: 'ready_for_pickup', done: 'marked as ready' },
};

const vendorOrder = async (user, id, transaction) => {
  const vendor = await Vendor.findOne({ where: { ownerUserId: user.id }, attributes: ['id'], transaction });
  return lockForUpdate(Order, id, transaction, { where: { vendorId: vendor?.id ?? '' }, message: NOT_FOUND });
};

/** POST /orders/{id}/accept|preparing|ready (409 INVALID_STATUS for anything else). */
export const vendorMove = async (user, id, action) => {
  const { from, to, done } = VENDOR_MOVES[action];
  // A late accept finds the order auto-rejected first, as the mock does on read
  if (action === 'accept') await autoReject(id).catch(() => {});
  await withTransaction(async (transaction) => {
    const order = await vendorOrder(user, id, transaction);
    if (order.status !== from) {
      throw new ConflictError(
        'INVALID_STATUS',
        order.status === 'rejected' && action === 'accept'
          ? 'This order was not accepted in time, so the customer was refunded.'
          : `This order can't be ${done} now. Refresh to see its latest status.`,
      );
    }
    await transition(order, to, { by: 'vendor', transaction });
    // Dispatch (phase 17) starts looking for a rider when the order is ready
  });
  if (action === 'accept') await cancelAutoReject(id);
  return loadOrderDetail(id, user);
};

/** POST /orders/{id}/reject: paid or accepted only, with a reason; full refund. */
export const vendorReject = async (user, id, { reason }) => {
  const why = String(reason ?? '').trim();
  if (!why) throw new ValidationError({ reason: 'Tell the customer why' });
  await withTransaction(async (transaction) => {
    const order = await vendorOrder(user, id, transaction);
    if (!['paid', 'accepted'].includes(order.status)) {
      throw new ConflictError('INVALID_STATUS', 'You can only reject an order before you start preparing it.');
    }
    await rejectOrder(order, why.slice(0, 200), 'vendor', transaction);
  });
  await cancelAutoReject(id);
  return loadOrderDetail(id, user);
};
