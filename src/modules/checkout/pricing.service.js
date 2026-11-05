// Server-side cart pricing (handoff section 6 "Checkout and orders"). Prices are always recomputed
// here; the client's numbers are never trusted. Reference: foodie-fe src/mocks/utils/orders.js
// (priceCart) and utils/settings-defaults.js (fees).
import { NotFoundError, QuoteError, ValidationError } from '../../core/errors/index.js';
import { haversineM, isOpenAt } from '../../core/utils/index.js';
import { models } from '../../db/index.js';
import { hoursFor } from '../catalogue/catalogue.service.js';
import { getSettings } from '../settings/settings.service.js';
import { publicVendorWhere } from '../vendors/visibility.js';

const { Address, FoodItem, Vendor } = models;

const MINUTE = 60 * 1000;
const MAX_QUANTITY = 50;
// Short hops still cost a minimum distance
const MIN_DISTANCE_M = 300;

/** deliveryBaseFee + ceil(km) × deliveryPerKm, capped at deliveryMaxFee. */
export const deliveryFeeFor = (distanceM, s) =>
  Math.min(s.deliveryBaseFee + Math.ceil(distanceM / 1000) * s.deliveryPerKm, s.deliveryMaxFee);

/** processingFeePct% of the amount, + processingFeeFlat from ₦2,500 up, capped at processingFeeCap. */
export const processingFeeFor = (amount, s) =>
  Math.min(
    Math.round((amount * s.processingFeePct) / 100) + (amount >= 250_000 ? s.processingFeeFlat : 0),
    s.processingFeeCap,
  );

/** [min, max] minutes from the vendor's prep time and the distance. */
export const etaFor = (prepTimeMins, distanceM) => [
  Math.round(prepTimeMins + distanceM / 400),
  Math.round(prepTimeMins + distanceM / 300 + 10),
];

const readAddress = async (user, input) => {
  if (input.addressId) {
    const saved = await Address.findOne({ where: { id: String(input.addressId), userId: user.id } });
    if (saved) return saved;
  } else if (input.address && typeof input.address === 'object') {
    const a = input.address;
    const lat = Number(a.lat);
    const lng = Number(a.lng);
    if (a.line1 && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { label: a.label, line1: a.line1, area: a.area, city: a.city, state: a.state, lat, lng };
    }
  }
  throw new ValidationError({ address: 'Pick a delivery address' }, 'Pick a delivery address.');
};

const unavailable = 'Something in your cart is no longer on the menu. Remove it and try again.';

/**
 * Prices a cart: { vendorId, items: [{ foodItemId, quantity, optionIds }], addressId | address,
 * scheduledFor }. Throws 404 (store not public), 422 VENDOR_PAUSED / EMPTY_CART / ITEM_UNAVAILABLE
 * / VENDOR_CLOSED / OUT_OF_RANGE or VALIDATION_ERROR.
 */
export const priceCart = async (user, input = {}) => {
  const vendor = input.vendorId
    ? await Vendor.findOne({ where: { id: String(input.vendorId), ...publicVendorWhere() } })
    : null;
  if (!vendor) throw new NotFoundError("This store isn't available right now.");
  if (vendor.isPaused) throw new QuoteError('VENDOR_PAUSED', `${vendor.name} isn't taking orders right now.`);
  if (!Array.isArray(input.items) || input.items.length === 0)
    throw new QuoteError('EMPTY_CART', 'Your cart is empty.');
  const address = await readAddress(user, input);

  const ids = input.items.map((raw) => String(raw?.foodItemId ?? ''));
  const items = new Map(
    (await FoodItem.findAll({ where: { id: ids, vendorId: vendor.id, isHidden: false } })).map((f) => [f.id, f]),
  );
  const lines = [];
  for (const [index, raw] of input.items.entries()) {
    const item = items.get(String(raw?.foodItemId ?? ''));
    if (!item) throw new QuoteError('ITEM_UNAVAILABLE', unavailable);
    if (!item.isAvailable) throw new QuoteError('ITEM_UNAVAILABLE', `${item.name} is sold out. Remove it to continue.`);
    const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.round(Number(raw.quantity) || 1)));
    const optionIds = Array.isArray(raw.optionIds) ? raw.optionIds.map(String) : [];
    const options = [];
    for (const g of item.optionGroups) {
      const picked = g.options.filter((o) => optionIds.includes(o.id));
      const field = `items.${index}.optionIds`;
      if (g.required && picked.length === 0) {
        throw new ValidationError(
          { [field]: `Choose ${g.name.toLowerCase()}` },
          `Choose ${g.name.toLowerCase()} for ${item.name}.`,
        );
      }
      if (g.max && picked.length > g.max) {
        throw new ValidationError(
          { [field]: `Choose up to ${g.max}` },
          `Choose up to ${g.max} for ${g.name.toLowerCase()}.`,
        );
      }
      for (const o of picked)
        options.push({ groupId: g.id, groupName: g.name, optionId: o.id, name: o.name, price: o.price });
    }
    const unit = item.price + options.reduce((sum, o) => sum + o.price, 0);
    lines.push({
      foodItemId: item.id,
      name: item.name,
      photo: item.photos?.[0] ?? null,
      unitPrice: item.price,
      quantity,
      options,
      lineTotal: unit * quantity,
    });
  }

  const now = new Date();
  const hours = (await hoursFor([vendor.id])).get(vendor.id);
  let scheduledFor = null;
  if (input.scheduledFor) {
    const at = new Date(input.scheduledFor);
    const fail = (message, field) => {
      throw new ValidationError({ scheduledFor: field }, message);
    };
    if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() + 25 * MINUTE)
      fail('Pick a time at least 30 minutes from now.', 'Pick a time at least 30 minutes from now');
    if (at.getTime() > now.getTime() + 7 * 24 * 60 * MINUTE)
      fail('You can schedule up to 7 days ahead.', 'Pick a time within the next 7 days');
    if (!isOpenAt(hours, at))
      fail(`${vendor.name} is closed at that time. Pick another time.`, `${vendor.name} is closed at that time`);
    scheduledFor = at.toISOString();
  }
  const isOpen = isOpenAt(hours, now);
  if (!isOpen && !scheduledFor) {
    throw new QuoteError('VENDOR_CLOSED', `${vendor.name} is closed right now. Pick a delivery time for later.`);
  }

  const distanceM = Math.max(MIN_DISTANCE_M, haversineM({ lat: vendor.lat, lng: vendor.lng }, address));
  if (distanceM > vendor.deliveryRadiusKm * 1000) {
    throw new QuoteError(
      'OUT_OF_RANGE',
      `${vendor.name} delivers up to ${vendor.deliveryRadiusKm} km away. Pick a closer address.`,
    );
  }

  const settings = await getSettings();
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const deliveryFee = deliveryFeeFor(distanceM, settings);
  const processingFee = processingFeeFor(subtotal + deliveryFee, settings);
  return {
    vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, logo: vendor.logoUrl },
    lines,
    subtotal,
    deliveryFee,
    processingFee,
    total: subtotal + deliveryFee + processingFee,
    distanceM,
    etaMins: etaFor(vendor.prepTimeMins, distanceM),
    isOpen,
    scheduledFor,
    address: {
      label: address.label ?? 'Delivery',
      line1: address.line1,
      area: address.area ?? '',
      city: address.city ?? '',
      state: address.state ?? '',
      lat: Number(address.lat),
      lng: Number(address.lng),
    },
  };
};
