// Public catalogue (handoff section 3 and 6 "Catalogue and visibility"): categories, food items,
// vendors and storefronts. Only public stores (BR-SUB-06) and dishes that are neither hidden nor
// deleted are ever returned; sold-out dishes stay with isAvailable false.
// Reference: foodie-fe src/mocks/handlers/catalogue.js and categories.js.
import { literal, Op, where } from 'sequelize';
import { NotFoundError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { CENTRAL_LAGOS, distanceSql } from '../../core/utils/index.js';
import { models } from '../../db/index.js';
import { publicVendorWhere } from '../vendors/visibility.js';
import { toOpeningHoursDto } from '../vendors/vendors.presenter.js';
import { createContext, toFoodItemDto, toPublicVendorDto } from './catalogue.presenter.js';
import { personalFor } from './personal.js';

const { Category, FoodItem, Vendor, VendorOpeningHour, Address } = models;

const VENDOR_ATTRIBUTES = [
  'id',
  'name',
  'slug',
  'type',
  'description',
  'phone',
  'logoUrl',
  'coverUrl',
  'addressLine1',
  'area',
  'city',
  'state',
  'lat',
  'lng',
  'deliveryRadiusKm',
  'prepTimeMins',
  'isPaused',
  'rating',
  'ratingCount',
  'followersCount',
  'approvalStatus',
  'subscriptionStatus',
  'createdAt',
];

const number = (value) => (value === undefined || value === null || value === '' ? NaN : Number(value));

/** Where `distanceM` is measured from: ?lat&lng, else the user's default address, else central Lagos. */
export const originFor = async (user, query = {}) => {
  const lat = number(query.lat);
  const lng = number(query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  if (user) {
    const address = await Address.findOne({ where: { userId: user.id, isDefault: true } });
    if (address) return { lat: address.lat, lng: address.lng };
  }
  return CENTRAL_LAGOS;
};

/** vendorId → opening hours ({ day, open, close, closed }) for the vendors on a page. */
export const hoursFor = async (vendorIds, { transaction } = {}) => {
  const ids = [...new Set(vendorIds)];
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const rows = await VendorOpeningHour.findAll({ where: { vendorId: ids }, transaction });
  for (const id of ids) map.set(id, toOpeningHoursDto(rows.filter((r) => r.vendorId === id)));
  return map;
};

/** A ready serialiser context for the vendors on a page and the signed-in user. */
export const contextFor = async (user, origin, vendorIds, foodItemIds = []) => {
  const [hoursByVendor, personal] = await Promise.all([
    hoursFor(vendorIds),
    personalFor(user, { vendorIds, foodItemIds }),
  ]);
  return createContext({ origin, hoursByVendor, ...personal });
};

/** Public food items: the item is visible and its store is public. Used by every public read. */
export const publicItemsInclude = () => [
  { model: Vendor, as: 'vendor', required: true, where: publicVendorWhere(), attributes: VENDOR_ATTRIBUTES },
  { model: Category, as: 'category', attributes: ['id', 'name'] },
];
export const PUBLIC_ITEM_WHERE = { isHidden: false };

// ── Categories ───────────────────────────────────────────────────────────────

const CATEGORY_LIST = {
  searchFields: ['name'],
  defaultSort: 'sortOrder',
  sortable: { sortOrder: 'sortOrder', name: 'name' },
};

/** GET /categories, with how many public dishes each has. */
export const listCategories = async (query) => {
  const { data, meta } = await paginate(Category, buildListQuery(query, CATEGORY_LIST, { maxLimit: 100 }));
  const counts = await FoodItem.count({
    where: { ...PUBLIC_ITEM_WHERE, categoryId: data.map((c) => c.id) },
    include: [{ model: Vendor, as: 'vendor', required: true, where: publicVendorWhere(), attributes: [] }],
    group: ['categoryId'],
  });
  const byCategory = new Map(counts.map((c) => [c.categoryId, c.count]));
  return {
    data: data.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      image: c.imageUrl,
      sortOrder: c.sortOrder,
      itemCount: byCategory.get(c.id) ?? 0,
    })),
    meta,
  };
};

// ── Food items ───────────────────────────────────────────────────────────────

// GET /food-items (handoff section 3): search name, description, vendor and category names
const foodItemList = (origin) => {
  const distance = literal(distanceSql('`vendor`.`lat`', '`vendor`.`lng`', origin));
  return {
    searchFields: ['name', 'description', '$vendor.name$', '$category.name$'],
    filters: {
      categoryId: 'categoryId',
      vendorId: 'vendorId',
      available: ([value]) => (value === 'true' ? { isAvailable: true } : undefined),
      minPrice: { field: 'price', op: 'gte', type: 'integer' },
      maxPrice: { field: 'price', op: 'lte', type: 'integer' },
      minRating: ([value]) =>
        Number.isFinite(number(value)) ? { '$vendor.rating$': { [Op.gte]: Number(value) } } : undefined,
      maxDistanceKm: ([value]) =>
        Number.isFinite(number(value)) ? where(distance, Op.lte, Number(value) * 1000) : undefined,
    },
    defaultSort: '-likesCount',
    sortable: {
      likesCount: 'likesCount',
      commentsCount: 'commentsCount',
      ordersCount: 'ordersCount',
      price: 'price',
      name: 'name',
      createdAt: 'createdAt',
      rating: ['vendor', 'rating'],
      distanceM: (direction) => [distance, direction],
    },
    include: publicItemsInclude(),
  };
};

export const serializeItems = async (user, origin, items) => {
  const ctx = await contextFor(
    user,
    origin,
    items.map((f) => f.vendorId),
    items.map((f) => f.id),
  );
  return items.map((f) => toFoodItemDto(f, ctx));
};

/** GET /food-items */
export const listFoodItems = async (user, query) => {
  const origin = await originFor(user, query);
  const listQuery = buildListQuery(query, foodItemList(origin));
  listQuery.where = { [Op.and]: [listQuery.where, PUBLIC_ITEM_WHERE] };
  const { data, meta } = await paginate(FoodItem, listQuery);
  return { data: await serializeItems(user, origin, data), meta };
};

const DISH_GONE = "We couldn't find that dish. It may have been removed.";

/** GET /food-items/{id}: 404 when hidden, deleted or the store isn't public. */
export const getFoodItem = async (user, id, query) => {
  const item = await FoodItem.findOne({ where: { id, ...PUBLIC_ITEM_WHERE }, include: publicItemsInclude() });
  if (!item) throw new NotFoundError(DISH_GONE);
  const [dto] = await serializeItems(user, await originFor(user, query), [item]);
  return dto;
};

// ── Vendors ──────────────────────────────────────────────────────────────────

/** itemCount and categoryIds of public dishes, per vendor. */
const menuSummary = async (vendorIds) => {
  const rows = vendorIds.length
    ? await FoodItem.findAll({
        where: { vendorId: vendorIds, ...PUBLIC_ITEM_WHERE },
        attributes: ['vendorId', 'categoryId'],
      })
    : [];
  const map = new Map(vendorIds.map((id) => [id, { itemCount: 0, categoryIds: [] }]));
  for (const { vendorId, categoryId } of rows) {
    const entry = map.get(vendorId);
    entry.itemCount += 1;
    if (!entry.categoryIds.includes(categoryId)) entry.categoryIds.push(categoryId);
  }
  return map;
};

const serializeVendors = async (user, origin, vendors) => {
  const ids = vendors.map((v) => v.id);
  const [ctx, menus] = await Promise.all([contextFor(user, origin, ids), menuSummary(ids)]);
  return vendors.map((v) => toPublicVendorDto(v, ctx, menus.get(v.id)));
};

// GET /vendors (handoff section 3): search name, area, city; filter city; default -rating
const vendorList = (origin) => {
  const distance = literal(distanceSql('`Vendor`.`lat`', '`Vendor`.`lng`', origin));
  return {
    searchFields: ['name', 'area', 'city'],
    filters: { city: 'city', type: 'type' },
    defaultSort: '-rating',
    sortable: {
      rating: 'rating',
      name: 'name',
      createdAt: 'createdAt',
      followersCount: 'followersCount',
      distanceM: (direction) => [distance, direction],
    },
  };
};

/** GET /vendors: public stores only. */
export const listVendors = async (user, query) => {
  const origin = await originFor(user, query);
  const listQuery = buildListQuery(query, vendorList(origin));
  listQuery.where = { [Op.and]: [listQuery.where, publicVendorWhere()] };
  const { data, meta } = await paginate(Vendor, listQuery, { attributes: VENDOR_ATTRIBUTES });
  return { data: await serializeVendors(user, origin, data), meta };
};

/** GET /vendors/{slugOrId}: 404 when the store isn't public (BR-SUB-06). */
export const getVendor = async (user, slugOrId, query) => {
  const vendor = await Vendor.findOne({
    where: { [Op.or]: [{ slug: slugOrId }, { id: slugOrId }], ...publicVendorWhere() },
    attributes: VENDOR_ATTRIBUTES,
  });
  if (!vendor) throw new NotFoundError("This store isn't available right now.");
  const [dto] = await serializeVendors(user, await originFor(user, query), [vendor]);
  return dto;
};
