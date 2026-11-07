// Dispatch admins: the live map (FR-GPS-04) and manual reassignment before pickup.
// Reference: foodie-fe src/mocks/realtime.js (liveMapSnapshot) and handlers/admin.js (reassign).
import { Op } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { notify } from '../notifications/notifications.service.js';
import { loadOrderDetail, transition } from '../orders/orders.service.js';
import { getSettings } from '../settings/settings.service.js';
import { dropoffFor, pickupFor } from './deliveries.presenter.js';
import { MOVING_STATUSES, cancelExpiry, isRiderBusy } from './dispatch.service.js';

const { Delivery, DeliveryOffer, Order, Rider, User, Vendor } = models;

const LIVE_STATUSES = ['ready_for_pickup', ...MOVING_STATUSES];
const iso = (date) => (date ? new Date(date).toISOString() : null);

/** GET /admin/live-map and the `admin:live-map` push: online riders and active deliveries. */
export const liveMapSnapshot = async () => {
  const [riders, orders] = await Promise.all([
    Rider.findAll({
      where: { isOnline: true, lat: { [Op.ne]: null } },
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
    }),
    Order.findAll({
      where: { status: LIVE_STATUSES },
      include: [{ model: Vendor, as: 'vendor', attributes: ['name', 'city', 'lat', 'lng'], paranoid: false }],
      order: [['updatedAt', 'DESC']],
    }),
  ]);
  const busy = new Map(
    orders.filter((o) => o.riderId && MOVING_STATUSES.includes(o.status)).map((o) => [o.riderId, o.id]),
  );
  return {
    riders: riders.map((r) => ({
      id: r.id,
      name: r.user?.name ?? '',
      city: r.city,
      vehicleType: r.vehicleType,
      lat: r.lat,
      lng: r.lng,
      lastSeenAt: iso(r.lastSeenAt),
      orderId: busy.get(r.id) ?? null,
    })),
    deliveries: orders.map((o) => ({
      orderId: o.id,
      code: o.code,
      status: o.status,
      city: o.vendor?.city ?? o.address.city,
      riderId: o.riderId,
      vendor: { name: o.vendorName, lat: o.vendor?.lat ?? null, lng: o.vendor?.lng ?? null },
      dropoff: { area: o.address.area, lat: o.address.lat, lng: o.address.lng },
      etaMins: [o.etaMinMins, o.etaMaxMins],
    })),
    at: new Date().toISOString(),
  };
};

/**
 * POST /admin/orders/{id}/reassign `{ riderId }`: gives the order to another rider before pickup
 * (409 after), audited. The rider must be approved, not already on it and not busy (422 riderId).
 */
export const reassignOrder = async (actor, orderId, { riderId }, req) => {
  const settings = await getSettings();
  const pending = await withTransaction(async (transaction) => {
    const order = await lockForUpdate(Order, orderId, transaction, { message: "We couldn't find that order." });
    if (!['ready_for_pickup', 'rider_assigned'].includes(order.status)) {
      throw new ConflictError('INVALID_STATUS', 'You can only reassign an order before the rider picks it up.');
    }
    const rider = riderId ? await Rider.findByPk(riderId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
    if (rider) rider.user = await User.findByPk(rider.userId, { transaction });
    if (!rider || rider.approvalStatus !== 'approved' || rider.user?.status !== 'active') {
      throw new ValidationError({ riderId: 'Pick an approved rider' });
    }
    if (rider.id === order.riderId) throw new ValidationError({ riderId: 'This rider already has the order' });
    if (await isRiderBusy(rider.id, { transaction })) {
      throw new ValidationError({ riderId: 'This rider is on another delivery' });
    }

    const previous = order.riderId
      ? await Rider.findByPk(order.riderId, { include: [{ model: User, as: 'user' }], transaction })
      : null;
    const vendor = await Vendor.findByPk(order.vendorId, { transaction, paranoid: false });
    const delivery = await Delivery.findOne({
      where: { orderId: order.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const assignment = { riderId: rider.id, assignedAt: new Date(), route: [], status: 'assigned' };
    if (delivery) await delivery.update(assignment, { transaction });
    else {
      await Delivery.create(
        {
          ...assignment,
          orderId: order.id,
          fee: order.deliveryFee,
          payoutPct: settings.riderPayoutPct,
          distanceM: order.distanceM,
          pickup: pickupFor(vendor),
          dropoff: dropoffFor(order),
        },
        { transaction },
      );
    }

    // Offers still out for this order end now
    const offers = await DeliveryOffer.findAll({ where: { orderId: order.id, status: 'pending' }, transaction });
    for (const offer of offers) await offer.update({ status: 'expired', respondedAt: new Date() }, { transaction });

    const name = rider.user.name;
    // Already assigned: a new history entry, and the customer isn't told twice that a rider is coming
    await transition(order, 'rider_assigned', {
      by: 'admin',
      note: `Reassigned to ${name}`,
      transaction,
      fields: { riderId: rider.id },
      silent: order.status === 'rider_assigned',
    });

    if (previous) {
      await notify(
        previous.userId,
        {
          type: 'order',
          title: 'Delivery reassigned',
          body: `Order KJT-${order.code} went to another rider.`,
          link: '/rider',
        },
        { transaction },
      );
    }
    await notify(
      rider.userId,
      {
        type: 'order',
        title: 'New delivery for you',
        body: `Pick up order KJT-${order.code} from ${vendor.name}.`,
        link: '/rider/delivery',
      },
      { transaction },
    );
    await audit.log(
      {
        actor,
        action: 'order.reassign',
        targetType: 'order',
        targetId: order.id,
        summary: `KJT-${order.code}: ${previous?.user?.name ?? 'no rider'} → ${name}`,
        req,
      },
      { transaction },
    );
    return offers;
  });
  for (const offer of pending) await cancelExpiry(offer.id);
  const detail = await loadOrderDetail(orderId, actor);
  if (!detail) throw new NotFoundError();
  return detail;
};
