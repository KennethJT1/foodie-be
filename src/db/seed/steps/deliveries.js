// Phase 17 seed (handoff 8): a delivery for every order that had a rider, with a route for the ones
// that were picked up. Ada's live order has a route half way to her door, and its rider (and the
// rider heading to Mama Put) are online where the route ends, so tracking and the live map show
// them. No Faker: the data follows from the orders step.
import { DEFAULT_SETTINGS } from '../../../modules/settings/settings.defaults.js';
import { dropoffFor, earningFor, pickupFor } from '../../../modules/deliveries/deliveries.presenter.js';
import { models, newId } from '../../index.js';

const { Delivery, Order, Rider, Vendor } = models;

const STATUS = { rider_assigned: 'assigned', picked_up: 'picked_up', delivered: 'delivered' };
const ROUTE_POINTS = 8;
const LIVE_POINT_MS = 40_000;

const at = (order, status) => {
  const step = order.statusHistory.find((h) => h.status === status);
  return step ? new Date(step.at) : null;
};

/** `count` points from `from` towards `to`, `share` of the way (1 = all of it). */
const line = (from, to, count, share = 1) =>
  Array.from({ length: count }, (_, i) => {
    const t = (share * (i + 1)) / count;
    return {
      lat: Number((from.lat + (to.lat - from.lat) * t).toFixed(7)),
      lng: Number((from.lng + (to.lng - from.lng) * t).toFixed(7)),
    };
  });

export const deliveries = async ({ transaction, now }) => {
  const orders = await Order.findAll({
    where: { status: Object.keys(STATUS) },
    include: [{ model: Vendor, as: 'vendor', paranoid: false }],
    order: [['createdAt', 'ASC']],
    transaction,
  });
  const payoutPct = DEFAULT_SETTINGS.riderPayoutPct;
  const live = [];

  const rows = orders
    .filter((o) => o.riderId)
    .map((order) => {
      const pickup = pickupFor(order.vendor);
      const dropoff = dropoffFor(order);
      const assignedAt = at(order, 'rider_assigned') ?? order.createdAt;
      const pickedUpAt = at(order, 'picked_up');
      const deliveredAt = at(order, 'delivered');
      let route = [];
      if (order.status === 'delivered') {
        const span = deliveredAt.getTime() - pickedUpAt.getTime();
        route = line(pickup, dropoff, ROUTE_POINTS).map((p, i) => ({
          ...p,
          at: new Date(pickedUpAt.getTime() + (span * (i + 1)) / ROUTE_POINTS).toISOString(),
        }));
      } else if (order.status === 'picked_up') {
        // On the way: half way there, the last point just now
        route = line(pickup, dropoff, ROUTE_POINTS, 0.5).map((p, i) => ({
          ...p,
          at: new Date(now - (ROUTE_POINTS - 1 - i) * LIVE_POINT_MS).toISOString(),
        }));
        live.push({ riderId: order.riderId, ...route.at(-1) });
      } else {
        // Heading to the vendor: a short ride away
        live.push({
          riderId: order.riderId,
          lat: Number((pickup.lat + 0.012).toFixed(7)),
          lng: Number((pickup.lng - 0.009).toFixed(7)),
        });
      }
      return {
        id: newId(),
        orderId: order.id,
        riderId: order.riderId,
        status: STATUS[order.status],
        fee: order.deliveryFee,
        payoutPct,
        riderEarning: order.status === 'delivered' ? earningFor(order.deliveryFee, payoutPct) : 0,
        distanceM: order.distanceM,
        pickup,
        dropoff,
        route,
        assignedAt,
        pickedUpAt,
        deliveredAt,
        createdAt: assignedAt,
        updatedAt: deliveredAt ?? pickedUpAt ?? assignedAt,
      };
    });
  await Delivery.bulkCreate(rows, { transaction });

  for (const { riderId, lat, lng } of live) {
    await Rider.update(
      { isOnline: true, lat, lng, lastSeenAt: new Date(now) },
      { where: { id: riderId }, transaction },
    );
  }
};
