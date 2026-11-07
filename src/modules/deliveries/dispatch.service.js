// Dispatch (handoff section 6 "Dispatch and riders"): a ready order is offered to the nearest
// online, approved, free rider in the vendor's city for `riderOfferTimeoutSec`; a decline or
// timeout offers it to the next rider. Riders who come free (online, delivered, declined) are
// offered the nearest waiting order. Nobody left → Dispatch admins are told once and the order is
// retried every minute while it waits.
import { Op, literal } from 'sequelize';
import { logger } from '../../config/logger.js';
import { adminsWithPermission } from '../../core/auth/index.js';
import { addJob, getQueue, jobId, withTimeout } from '../../core/queue/index.js';
import { distanceSql, haversineM } from '../../core/utils/index.js';
import { models, withTransaction } from '../../db/index.js';
import { emitTo } from '../../realtime/emit.js';
import { rooms } from '../../realtime/rooms.js';
import { notify } from '../notifications/notifications.service.js';
import { getSettings } from '../settings/settings.service.js';
import { earningFor, toJobOfferDto } from './deliveries.presenter.js';

const { DeliveryOffer, Order, Rider, User, Vendor } = models;

/** Orders a rider is out on; a rider with one is busy. */
export const MOVING_STATUSES = ['rider_assigned', 'picked_up'];
const RETRY_MS = 60_000;

const now = () => new Date();

const busyRiderIds = literal(
  `(SELECT o.rider_id FROM orders o WHERE o.rider_id IS NOT NULL AND o.status IN ('rider_assigned', 'picked_up'))`,
);
const offeredRiderIds = literal(
  `(SELECT d.rider_id FROM delivery_offers d WHERE d.status = 'pending' AND d.expires_at > CURRENT_TIMESTAMP(3))`,
);

/** True when the rider is out on a delivery. */
export const isRiderBusy = async (riderId, { transaction } = {}) =>
  Boolean(await Order.count({ where: { riderId, status: MOVING_STATUSES }, transaction }));

/** A pending offer that hasn't run out yet. */
const livePendingOffer = (where, transaction) =>
  DeliveryOffer.findOne({ where: { ...where, status: 'pending', expiresAt: { [Op.gt]: now() } }, transaction });

const scheduleExpiry = (offer) =>
  addJob(
    'dispatch',
    'offer.expire',
    { offerId: offer.id },
    { jobId: jobId('offerExpire', offer.id), delay: Math.max(0, offer.expiresAt.getTime() - Date.now()) },
  ).catch((err) => logger.error({ err, offerId: offer.id }, 'Could not schedule offer expiry; reads expire it'));

export const cancelExpiry = (offerId) =>
  withTimeout(getQueue('dispatch').remove(jobId('offerExpire', offerId)), 'remove offer expiry').catch(() => {});

/** Queues `dispatchOrder` (job `dispatch:order.dispatch`); at most one per order per minute. */
export const queueDispatch = (orderId, delay = RETRY_MS) =>
  addJob(
    'dispatch',
    'order.dispatch',
    { orderId },
    { jobId: jobId('dispatch', orderId, Math.floor((Date.now() + delay) / RETRY_MS)), delay },
  ).catch((err) => logger.error({ err, orderId }, 'Could not queue dispatch'));

/**
 * Sends `riderId` a job offer for `orderId` when both are still free. Rows are locked so two
 * dispatches can't hand one order to two riders, or two orders to one rider. Returns the offer or null.
 */
export const createOffer = async (orderId, riderId) => {
  const settings = await getSettings();
  const made = await withTransaction(async (transaction) => {
    const lock = transaction.LOCK.UPDATE;
    const order = await Order.findByPk(orderId, { transaction, lock });
    if (!order || order.status !== 'ready_for_pickup' || order.riderId) return null;
    if (await livePendingOffer({ orderId }, transaction)) return null;

    const rider = await Rider.findByPk(riderId, { transaction, lock });
    if (!rider?.isOnline || rider.approvalStatus !== 'approved') return null;
    if (await livePendingOffer({ riderId }, transaction)) return null;
    if (await isRiderBusy(riderId, { transaction })) return null;

    const vendor = await Vendor.findByPk(order.vendorId, { transaction, paranoid: false });
    const offer = await DeliveryOffer.create(
      {
        orderId,
        riderId,
        fee: order.deliveryFee,
        earning: earningFor(order.deliveryFee, settings.riderPayoutPct),
        distanceM: order.distanceM,
        toPickupM: rider.lat == null || vendor.lat == null ? null : haversineM(rider, vendor),
        pickup: { name: vendor.name, area: vendor.area ?? '', lat: vendor.lat, lng: vendor.lng },
        dropoff: { area: order.address.area, city: order.address.city, lat: order.address.lat, lng: order.address.lng },
        expiresAt: new Date(Date.now() + settings.riderOfferTimeoutSec * 1000),
      },
      { transaction },
    );
    return { offer, order, rider };
  });
  if (!made) return null;

  const { offer, order, rider } = made;
  emitTo([rooms.rider(rider.id), rooms.user(rider.userId)], 'rider:job:offer', toJobOfferDto(offer, order.code));
  await scheduleExpiry(offer);
  return offer;
};

/** Tells Dispatch admins (orders.reassign) once that nobody has taken the order. */
const alertDispatch = async (orderId) => {
  const alerted = await withTransaction(async (transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order || order.dispatchAlertedAt) return null;
    await order.update({ dispatchAlertedAt: now() }, { transaction });
    return order;
  });
  if (!alerted) return;
  const admins = await adminsWithPermission('orders.reassign');
  await Promise.all(
    admins.map((admin) =>
      notify(admin.id, {
        type: 'order',
        title: 'No rider for an order',
        body: `Order KJT-${alerted.code} from ${alerted.vendorName} is ready and no rider has taken it. Assign one.`,
        link: `/admin/orders/${alerted.id}`,
      }),
    ),
  );
};

/**
 * Offers a ready order to the nearest free rider who hasn't been offered it yet. Safe to call any
 * number of times (job `dispatch:order.dispatch`, after ready / decline / expiry).
 */
export const dispatchOrder = async (orderId) => {
  const order = await Order.findByPk(orderId, {
    include: [{ model: Vendor, as: 'vendor', paranoid: false }],
  });
  if (!order || order.status !== 'ready_for_pickup' || order.riderId) return { skipped: true };
  if (await livePendingOffer({ orderId })) return { waiting: true };

  const vendor = order.vendor;
  const tried = (await DeliveryOffer.findAll({ where: { orderId }, attributes: ['riderId'] })).map((o) => o.riderId);
  const origin = vendor?.lat == null ? null : { lat: vendor.lat, lng: vendor.lng };
  const candidates = await Rider.findAll({
    where: {
      approvalStatus: 'approved',
      isOnline: true,
      lat: { [Op.ne]: null },
      ...(vendor?.city && { city: vendor.city }),
      [Op.and]: [
        { id: { [Op.notIn]: busyRiderIds } },
        { id: { [Op.notIn]: offeredRiderIds } },
        ...(tried.length ? [{ id: { [Op.notIn]: tried } }] : []),
      ],
    },
    include: [{ model: User, as: 'user', attributes: [], where: { status: 'active' } }],
    order: origin
      ? [[literal(distanceSql('`Rider`.`lat`', '`Rider`.`lng`', origin)), 'ASC']]
      : [['lastSeenAt', 'DESC']],
    limit: 5,
  });

  for (const rider of candidates) {
    const offer = await createOffer(orderId, rider.id);
    if (offer) return { offered: offer.id, riderId: rider.id };
  }
  await alertDispatch(orderId);
  await queueDispatch(orderId);
  return { noRider: true };
};

/** Offers a free rider the nearest ready order in their city that they haven't been offered. */
export const findJobFor = async (riderId) => {
  const rider = await Rider.findByPk(riderId);
  if (!rider?.isOnline || rider.approvalStatus !== 'approved' || rider.lat == null) return null;
  if ((await livePendingOffer({ riderId })) || (await isRiderBusy(riderId))) return null;

  const orders = await Order.findAll({
    where: {
      status: 'ready_for_pickup',
      riderId: null,
      [Op.and]: [
        literal(
          `NOT EXISTS (SELECT 1 FROM delivery_offers d WHERE d.order_id = \`Order\`.\`id\` AND (d.rider_id = ${Order.sequelize.escape(riderId)} OR (d.status = 'pending' AND d.expires_at > CURRENT_TIMESTAMP(3))))`,
        ),
      ],
    },
    include: [
      {
        model: Vendor,
        as: 'vendor',
        attributes: [],
        paranoid: false,
        ...(rider.city && { where: { city: rider.city } }),
      },
    ],
    order: [[literal(distanceSql('`vendor`.`lat`', '`vendor`.`lng`', rider)), 'ASC']],
    limit: 5,
  });
  for (const order of orders) {
    const offer = await createOffer(order.id, riderId);
    if (offer) return offer;
  }
  return null;
};

/**
 * Marks pending offers past their time as expired and offers those orders to the next rider. The
 * `offer.expire` job does this on time; reads call it too in case the worker was late.
 */
export const expireOffers = async (where = {}) => {
  const stale = await DeliveryOffer.findAll({
    where: { ...where, status: 'pending', expiresAt: { [Op.lte]: now() } },
    attributes: ['id', 'orderId'],
  });
  if (!stale.length) return 0;
  const [count] = await DeliveryOffer.update(
    { status: 'expired' },
    { where: { id: stale.map((o) => o.id), status: 'pending' } },
  );
  for (const orderId of new Set(stale.map((o) => o.orderId))) {
    await dispatchOrder(orderId).catch((err) => logger.error({ err, orderId }, 'Dispatch after expiry failed'));
  }
  return count;
};

/** Job `dispatch:offer.expire`. */
export const expireOffer = (offerId) => expireOffers({ id: offerId });

/** A rider going offline: their pending offers end and those orders go to the next rider. */
export const withdrawOffers = async (riderId) => {
  const pending = await DeliveryOffer.findAll({ where: { riderId, status: 'pending' }, attributes: ['id', 'orderId'] });
  if (!pending.length) return;
  await DeliveryOffer.update(
    { status: 'expired', respondedAt: now() },
    { where: { id: pending.map((o) => o.id), status: 'pending' } },
  );
  for (const offer of pending) {
    await cancelExpiry(offer.id);
    await dispatchOrder(offer.orderId).catch((err) =>
      logger.error({ err, orderId: offer.orderId }, 'Dispatch after going offline failed'),
    );
  }
};
