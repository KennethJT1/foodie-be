// Shapes for job offers and deliveries (contract JobOffer, ActiveDelivery; mock riders.js / realtime.js).

const iso = (date) => (date ? new Date(date).toISOString() : null);

/** The rider's share of a delivery fee at `payoutPct`. */
export const earningFor = (fee, payoutPct) => Math.round((fee * payoutPct) / 100);

/** JobOffer. `orderCode` comes from the offer's order (included as `order`) or is passed in. */
export const toJobOfferDto = (offer, orderCode = offer.order?.code) => ({
  id: offer.id,
  orderId: offer.orderId,
  orderCode,
  riderId: offer.riderId,
  status: offer.status,
  fee: offer.fee,
  earning: offer.earning,
  distanceM: offer.distanceM,
  toPickupM: offer.toPickupM,
  pickup: offer.pickup,
  dropoff: offer.dropoff,
  expiresAt: iso(offer.expiresAt),
  createdAt: iso(offer.createdAt),
});

/**
 * ActiveDelivery: what the rider needs on the road. `order` (with `items`) and `rider` are given;
 * `status` is the order's status, as in the mock.
 */
export const toActiveDeliveryDto = (delivery, order, rider) => ({
  id: delivery.id,
  orderId: order.id,
  orderCode: order.code,
  status: order.status,
  fee: delivery.fee,
  earning: earningFor(delivery.fee, delivery.payoutPct),
  distanceM: delivery.distanceM,
  itemCount: (order.items ?? []).reduce((n, l) => n + l.quantity, 0),
  pickup: delivery.pickup,
  dropoff: delivery.dropoff,
  rider: { lat: rider.lat, lng: rider.lng },
  assignedAt: iso(delivery.assignedAt),
  pickedUpAt: iso(delivery.pickedUpAt),
});

/** The delivery on an order (detail and `order:status`): mock `publicDelivery`. */
export const toPublicDeliveryDto = (delivery) =>
  delivery
    ? {
        id: delivery.id,
        status: delivery.status,
        pickup: delivery.pickup,
        dropoff: delivery.dropoff,
        route: delivery.route ?? [],
      }
    : null;

const joinAddress = (...parts) => parts.filter(Boolean).join(', ');

/** Where the rider collects the food (stored on the delivery). */
export const pickupFor = (vendor) => ({
  name: vendor.name,
  phone: vendor.phone ?? null,
  address: joinAddress(vendor.addressLine1, vendor.area),
  lat: vendor.lat,
  lng: vendor.lng,
});

/** Where the food goes (stored on the delivery). */
export const dropoffFor = (order) => ({
  name: order.customerName,
  phone: order.customerPhone ?? null,
  address: joinAddress(order.address.line1, order.address.area),
  note: order.deliveryNote ?? '',
  lat: order.address.lat,
  lng: order.address.lng,
});
