// The rider's side of a delivery: going online, offers, the active job, pickup and hand-over with
// the customer's code, and GPS. Reference: foodie-fe src/mocks/handlers/riders.js and realtime.js.
import { Op } from 'sequelize';
import { logger } from '../../config/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { haversineM } from '../../core/utils/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { emitTo } from '../../realtime/emit.js';
import { rooms } from '../../realtime/rooms.js';
import { notify } from '../notifications/notifications.service.js';
import { transition } from '../orders/orders.service.js';
import { getProfile } from '../riders/onboarding.service.js';
import { getSettings } from '../settings/settings.service.js';
import { dropoffFor, earningFor, pickupFor, toActiveDeliveryDto, toJobOfferDto } from './deliveries.presenter.js';
import {
  MOVING_STATUSES,
  cancelExpiry,
  dispatchOrder,
  expireOffers,
  findJobFor,
  withdrawOffers,
} from './dispatch.service.js';

const { Delivery, DeliveryOffer, Order, OrderItem, Rider, Vendor } = models;

const NOT_APPROVED = 'Your account is not approved yet.';
const OFFER_GONE = 'This job is no longer available.';

const after = (label, fn) => fn().catch((err) => logger.error({ err }, `${label} failed`));

/** The signed-in rider; dispatch needs an approved account (409 NOT_APPROVED). */
const approvedRider = async (user, { transaction, lock = false } = {}) => {
  const rider = await Rider.findOne({
    where: { userId: user.id },
    transaction,
    ...(lock && { lock: transaction.LOCK.UPDATE }),
  });
  if (!rider) throw new NotFoundError();
  if (rider.approvalStatus !== 'approved') throw new ConflictError('NOT_APPROVED', NOT_APPROVED);
  return rider;
};

/** The order a rider is out on (rider_assigned / picked_up), with its delivery. */
const movingOrder = (riderId, { transaction } = {}) =>
  Order.findOne({
    where: { riderId, status: MOVING_STATUSES },
    include: [{ model: Delivery, as: 'delivery' }],
    transaction,
  });

const activeDeliveryFor = async (rider) => {
  const order = await movingOrder(rider.id);
  if (!order?.delivery) return null;
  order.items = await OrderItem.findAll({ where: { orderId: order.id }, attributes: ['quantity'] });
  return toActiveDeliveryDto(order.delivery, order, rider);
};

// ── Online / offline ─────────────────────────────────────────────────────────

/** POST /rider/status: online starts offers, offline withdraws pending ones. Returns RiderProfile. */
export const setStatus = async (user, { isOnline, lat, lng }) => {
  const rider = await withTransaction(async (transaction) => {
    const row = await approvedRider(user, { transaction, lock: true });
    const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
    await row.update(
      { isOnline: Boolean(isOnline), lastSeenAt: new Date(), ...(hasPosition && { lat, lng }) },
      { transaction },
    );
    return row;
  });
  if (rider.isOnline) await after('Finding a job', () => findJobFor(rider.id));
  else await after('Withdrawing offers', () => withdrawOffers(rider.id));
  return getProfile(user);
};

// ── Offers ───────────────────────────────────────────────────────────────────

/** GET /rider/offers: the rider's offers still waiting for an answer. */
export const listOffers = async (user) => {
  const rider = await approvedRider(user);
  await expireOffers({ riderId: rider.id });
  const offers = await DeliveryOffer.findAll({
    where: { riderId: rider.id, status: 'pending' },
    include: [{ model: Order, as: 'order', attributes: ['code'] }],
    order: [['createdAt', 'DESC']],
  });
  return offers.map((o) => toJobOfferDto(o));
};

/** POST /deliveries/offers/{id}/accept: the order becomes rider_assigned (409 OFFER_GONE). */
export const acceptOffer = async (user, offerId) => {
  const rider = await approvedRider(user);
  await expireOffers({ id: offerId, riderId: rider.id });
  const settings = await getSettings();

  const outcome = await withTransaction(async (transaction) => {
    const lock = transaction.LOCK.UPDATE;
    const offer = await lockForUpdate(DeliveryOffer, offerId, transaction, { where: { riderId: rider.id } });
    if (offer.status !== 'pending' || offer.expiresAt <= new Date()) return { gone: OFFER_GONE };

    const order = await Order.findByPk(offer.orderId, { transaction, lock });
    if (!order || order.status !== 'ready_for_pickup' || order.riderId) {
      await offer.update({ status: 'expired', respondedAt: new Date() }, { transaction });
      return { gone: 'Another rider took this job.' };
    }
    const vendor = await Vendor.findByPk(order.vendorId, { transaction, paranoid: false });
    await offer.update({ status: 'accepted', respondedAt: new Date() }, { transaction });
    await Delivery.create(
      {
        orderId: order.id,
        riderId: rider.id,
        fee: order.deliveryFee,
        payoutPct: settings.riderPayoutPct,
        distanceM: order.distanceM,
        pickup: pickupFor(vendor),
        dropoff: dropoffFor(order),
        route: [],
        assignedAt: new Date(),
      },
      { transaction },
    );
    await transition(order, 'rider_assigned', { by: 'rider', transaction, fields: { riderId: rider.id } });
    return { offer };
  });
  // The answer is committed either way; a gone offer is reported after the expiry is saved
  await cancelExpiry(offerId);
  if (outcome.gone) {
    await after('Dispatch after a taken offer', () => findJobFor(rider.id));
    throw new ConflictError('OFFER_GONE', outcome.gone);
  }
  return activeDeliveryFor(await Rider.findByPk(rider.id));
};

/** POST /deliveries/offers/{id}/decline: the order goes to the next rider; returns the offer. */
export const declineOffer = async (user, offerId) => {
  const rider = await approvedRider(user);
  const offer = await withTransaction(async (transaction) => {
    const row = await lockForUpdate(DeliveryOffer, offerId, transaction, { where: { riderId: rider.id } });
    if (row.status === 'pending') {
      await row.update(
        { status: row.expiresAt <= new Date() ? 'expired' : 'declined', respondedAt: new Date() },
        { transaction },
      );
    }
    return row;
  });
  await cancelExpiry(offerId);
  await after('Dispatch after a decline', () => dispatchOrder(offer.orderId));
  await after('Finding the next job', () => findJobFor(rider.id));
  const order = await Order.findByPk(offer.orderId, { attributes: ['code'] });
  return toJobOfferDto(offer, order?.code);
};

// ── The active delivery ──────────────────────────────────────────────────────

/** GET /rider/delivery: the current delivery, or null. */
export const currentDelivery = async (user) => activeDeliveryFor(await approvedRider(user));

/** The rider's own delivery and its order, locked (404 for anyone else's). */
const ownDelivery = async (rider, deliveryId, transaction) => {
  const delivery = await lockForUpdate(Delivery, deliveryId, transaction, { where: { riderId: rider.id } });
  const order = await Order.findByPk(delivery.orderId, { transaction, lock: transaction.LOCK.UPDATE });
  return { delivery, order };
};

/** POST /deliveries/{id}/pickup: picked_up (409 when it isn't rider_assigned). */
export const pickup = async (user, deliveryId) => {
  const rider = await approvedRider(user);
  await withTransaction(async (transaction) => {
    const { delivery, order } = await ownDelivery(rider, deliveryId, transaction);
    if (order.status !== 'rider_assigned') {
      throw new ConflictError('INVALID_STATUS', 'This order has already been picked up.');
    }
    await delivery.update({ status: 'picked_up', pickedUpAt: new Date() }, { transaction });
    await transition(order, 'picked_up', { by: 'rider', transaction });
  });
  return activeDeliveryFor(await Rider.findByPk(rider.id));
};

/**
 * POST /deliveries/{id}/complete: the customer's 4-digit code hands the food over (422 on `code`
 * when it doesn't match). The rider earns the delivery's payoutPct of the fee.
 */
export const complete = async (user, deliveryId, { code }) => {
  const rider = await approvedRider(user);
  const done = await withTransaction(async (transaction) => {
    const { delivery, order } = await ownDelivery(rider, deliveryId, transaction);
    if (order.status !== 'picked_up') {
      throw new ConflictError('INVALID_STATUS', 'Pick up the order before you complete it.');
    }
    if (String(code ?? '') !== order.deliveryCode) {
      throw new ValidationError({ code: "That code doesn't match. Ask the customer to check their app." });
    }
    const riderEarning = earningFor(delivery.fee, delivery.payoutPct);
    await delivery.update({ status: 'delivered', deliveredAt: new Date(), riderEarning }, { transaction });
    await Rider.increment('tripsCount', { by: 1, where: { id: rider.id }, transaction });
    await transition(order, 'delivered', { by: 'rider', transaction });
    await notify(
      order.customerId,
      {
        type: 'order',
        title: 'How was your food?',
        body: `Rate ${order.vendorName} and your rider.`,
        link: `/account/orders/${order.id}`,
      },
      { transaction },
    );
    return { id: delivery.id, status: 'delivered', earning: riderEarning, orderCode: order.code };
  });
  await after('Finding the next job', () => findJobFor(rider.id));
  return done;
};

// ── GPS ──────────────────────────────────────────────────────────────────────

/** ETA from a point to the next stop: about 300 m a minute, as the mock. */
export const etaFor = (point, target) => {
  const mins = Math.max(1, Math.round(haversineM(point, target) / 300));
  return [mins, mins + 5];
};

const ROUTE_LIMIT = 2000;

/**
 * Socket `rider:location` `{ riderId, lat, lng, heading }` (about every 8 s). Accepted only from
 * the rider's own socket while online. Stores the position; during a delivery appends it to the
 * route, refreshes the ETA and forwards `rider:location` to the order's room.
 * Returns { ok } for the acknowledgement.
 */
export const recordLocation = async (user, { riderId, lat, lng, heading } = {}) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Send a valid position.' } };
  }
  const rider = await Rider.findOne({ where: { userId: user.id } });
  if (!rider || (riderId && riderId !== rider.id)) {
    return { ok: false, error: { code: 'NOT_FOUND', message: "We couldn't find that." } };
  }
  if (!rider.isOnline)
    return { ok: false, error: { code: 'INVALID_STATUS', message: 'Go online to share your location.' } };

  const at = new Date();
  await rider.update({ lat, lng, lastSeenAt: at });

  const order = await movingOrder(rider.id);
  if (!order?.delivery) return { ok: true };
  const { delivery } = order;
  const target = order.status === 'picked_up' ? delivery.dropoff : delivery.pickup;
  const etaMins = etaFor({ lat, lng }, target);
  const route = [...(delivery.route ?? []), { lat, lng, at: at.toISOString() }].slice(-ROUTE_LIMIT);
  await Promise.all([
    delivery.update({ route }),
    order.update({ etaMinMins: etaMins[0], etaMaxMins: etaMins[1] }, { silent: true }),
  ]);
  emitTo(rooms.order(order.id), 'rider:location', {
    orderId: order.id,
    riderId: rider.id,
    lat,
    lng,
    heading: Number.isFinite(heading) ? Math.round(heading) : null,
    etaMins,
    at: at.toISOString(),
  });
  return { ok: true };
};

/** Recent delivered trips for the admin rider detail. */
export const recentTrips = async (riderId, limit = 5) => {
  const rows = await Delivery.findAll({
    where: { riderId, status: 'delivered' },
    include: [{ model: Order, as: 'order', attributes: ['id', 'code', 'vendorName', 'address'] }],
    order: [['deliveredAt', 'DESC']],
    limit,
  });
  return rows.map((d) => ({
    id: d.id,
    orderId: d.orderId,
    orderCode: d.order?.code ?? null,
    vendorName: d.order?.vendorName ?? null,
    dropoffArea: d.order?.address?.area ?? null,
    distanceM: d.distanceM,
    fee: d.fee,
    earning: d.riderEarning,
    deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
  }));
};

/** Riders with a moving order, among `riderIds` (admin rider rows show `isBusy`). */
export const busyAmong = async (riderIds) => {
  if (!riderIds.length) return new Set();
  const rows = await Order.findAll({
    where: { riderId: { [Op.in]: riderIds }, status: MOVING_STATUSES },
    attributes: ['riderId'],
  });
  return new Set(rows.map((o) => o.riderId));
};
