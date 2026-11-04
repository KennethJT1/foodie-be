// Public catalogue shapes (contract FoodItem, Vendor). Reference: foodie-fe src/mocks/utils/catalogue.js.
import { haversineM, isOpenAt } from '../../core/utils/index.js';
import { toAddressDto } from '../vendors/vendors.presenter.js';

/**
 * Everything the serialisers need for one request: where distances are measured from, the
 * opening hours of the vendors on the page (vendorId → [{ day, open, close, closed }]) and what
 * the signed-in user liked / follows.
 */
export const createContext = ({
  origin,
  hoursByVendor = new Map(),
  likedIds = new Set(),
  followedIds = new Set(),
}) => ({
  origin,
  now: new Date(),
  hoursByVendor,
  likedIds,
  followedIds,
});

const distanceTo = (ctx, v) => (v?.lat == null ? null : haversineM(ctx.origin, { lat: v.lat, lng: v.lng }));

export const isVendorOpen = (v, ctx) => !v.isPaused && isOpenAt(ctx.hoursByVendor.get(v.id) ?? [], ctx.now);

/** The small vendor block inside food items (and orders later). */
export const toVendorSummary = (v, ctx) => ({
  id: v.id,
  name: v.name,
  slug: v.slug,
  logo: v.logoUrl,
  rating: v.rating,
  ratingCount: v.ratingCount,
  area: v.area,
  city: v.city,
  isOpen: isVendorOpen(v, ctx),
  isPaused: v.isPaused,
  prepTimeMins: v.prepTimeMins,
  deliveryRadiusKm: v.deliveryRadiusKm,
});

/** FoodItem (contract) with `vendor` and `category` included. */
export const toFoodItemDto = (f, ctx) => ({
  id: f.id,
  vendorId: f.vendorId,
  categoryId: f.categoryId,
  categoryName: f.category?.name ?? null,
  name: f.name,
  slug: f.slug,
  description: f.description,
  price: f.price,
  photos: f.photos,
  // Seeded photos carry { url, author, license, source }; the detail page shows "Photo: author, licence"
  photoCredits: f.photoCredits ?? [],
  portion: f.portion,
  prepTimeMins: f.prepTimeMins,
  isAvailable: f.isAvailable,
  availableDays: f.availableDays,
  availableFrom: f.availableFrom ?? null,
  availableTo: f.availableTo ?? null,
  optionGroups: f.optionGroups,
  likesCount: f.likesCount,
  commentsCount: f.commentsCount,
  ordersCount: f.ordersCount,
  isLiked: ctx.likedIds.has(f.id),
  distanceM: distanceTo(ctx, f.vendor),
  vendor: f.vendor ? toVendorSummary(f.vendor, ctx) : null,
  createdAt: f.createdAt.toISOString(),
});

/** Vendor (contract): public storefront fields, no bank details, documents or owner data. */
export const toPublicVendorDto = (v, ctx, { itemCount = 0, categoryIds = [] } = {}) => ({
  ...toVendorSummary(v, ctx),
  type: v.type,
  description: v.description,
  cover: v.coverUrl,
  phone: v.phone,
  address: toAddressDto(v),
  lat: v.lat,
  lng: v.lng,
  openingHours: ctx.hoursByVendor.get(v.id) ?? [],
  followersCount: v.followersCount,
  isFollowing: ctx.followedIds.has(v.id),
  distanceM: distanceTo(ctx, v),
  itemCount,
  categoryIds,
  createdAt: v.createdAt.toISOString(),
});
