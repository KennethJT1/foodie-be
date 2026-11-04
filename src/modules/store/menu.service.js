// The vendor's own menu (FR-VEN-04, plan limits). Reference: foodie-fe src/mocks/handlers/menu.js.
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { slugify } from '../../core/utils/index.js';
import { models, newId, withTransaction } from '../../db/index.js';
import { planLimitsFor } from '../subscriptions/plans.service.js';
import { ownVendor } from '../vendors/onboarding.service.js';

const { Category, FoodItem, Upload } = models;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A menu item as the vendor sees it (FoodItem fields plus isHidden). */
export const toMenuItemDto = (f) => ({
  id: f.id,
  vendorId: f.vendorId,
  categoryId: f.categoryId,
  categoryName: f.category?.name ?? null,
  name: f.name,
  slug: f.slug,
  description: f.description,
  price: f.price,
  photos: f.photos,
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
  isHidden: f.isHidden,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
});

const categoryInclude = [{ model: Category, as: 'category', attributes: ['id', 'name'] }];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Validates a create / edit (`existing` for PATCH, which may send only some fields) against the
 * plan's photo limit; returns the columns to save.
 */
const readItem = async (user, body, limits, existing, transaction) => {
  const errors = {};
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : (existing?.[key] ?? fallback));

  const name = String(pick('name', '')).trim();
  if (name.length < 2) errors.name = 'Enter the food name';
  else if (name.length > 80) errors.name = 'Keep the name under 80 characters';
  const description = String(pick('description', '')).trim();
  if (description.length > 500) errors.description = 'Keep it under 500 characters';
  const categoryId = pick('categoryId', null);
  if (!categoryId || !(await Category.findByPk(String(categoryId), { transaction })))
    errors.categoryId = 'Pick a category';
  const price = pick('price', null);
  if (!Number.isInteger(price) || price <= 0) errors.price = 'Price must be more than ₦0';
  const portion = String(pick('portion', '')).trim();
  if (portion.length > 60) errors.portion = 'Keep it under 60 characters';
  const prepTimeMins = pick('prepTimeMins', 20);
  if (!Number.isInteger(prepTimeMins) || prepTimeMins < 0 || prepTimeMins > 240)
    errors.prepTimeMins = 'Enter the preparation time in minutes';
  const isAvailable = pick('isAvailable', true);
  if (typeof isAvailable !== 'boolean') errors.isAvailable = 'Choose available or sold out';

  // Photos: what the item already has, or the vendor's own food photo uploads
  const photos = pick('photos', []);
  let photoCredits = existing?.photoCredits ?? [];
  if (!Array.isArray(photos) || !photos.length) errors.photos = 'Add at least one photo';
  else if (photos.length > limits.photosPerItem)
    errors.photos = `Your ${limits.planName} plan allows ${plural(limits.photosPerItem, 'photo')} per item`;
  else if (photos.some((url) => typeof url !== 'string')) errors.photos = 'Upload the photos again, then try once more';
  else {
    const kept = new Set(existing?.photos ?? []);
    const fresh = [...new Set(photos.filter((url) => !kept.has(url)))];
    const owned = fresh.length
      ? await Upload.count({ where: { url: fresh, userId: user.id, purpose: 'food_photo' }, transaction })
      : 0;
    if (owned !== fresh.length) errors.photos = 'Upload the photos again, then try once more';
    photoCredits = photoCredits.filter((c) => photos.includes(c.url));
  }

  const availableDays = pick('availableDays', [0, 1, 2, 3, 4, 5, 6]);
  if (
    !Array.isArray(availableDays) ||
    !availableDays.length ||
    availableDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    errors.availableDays = 'Pick at least one day';
  const availableFrom = pick('availableFrom', null) || null;
  const availableTo = pick('availableTo', null) || null;
  if ((availableFrom || availableTo) && !(TIME.test(availableFrom ?? '') && TIME.test(availableTo ?? '')))
    errors.availableFrom = 'Enter both times';
  else if (availableFrom && availableFrom >= availableTo)
    errors.availableTo = 'The end time must be after the start time';

  const groups = pick('optionGroups', []);
  if (!Array.isArray(groups)) errors.optionGroups = 'Option groups must be a list';
  else
    groups.forEach((g, i) => {
      if (!String(g?.name ?? '').trim()) errors[`optionGroups.${i}.name`] = 'Name this group';
      else if (String(g.name).trim().length > 60) errors[`optionGroups.${i}.name`] = 'Keep it under 60 characters';
      if (!Array.isArray(g?.options) || !g.options.length) errors[`optionGroups.${i}.name`] = 'Add at least one option';
      g?.options?.forEach?.((o, j) => {
        if (!String(o?.name ?? '').trim()) errors[`optionGroups.${i}.options.${j}.name`] = 'Name this option';
        const optionPrice = o?.price ?? 0;
        if (!Number.isInteger(optionPrice) || optionPrice < 0)
          errors[`optionGroups.${i}.options.${j}.price`] = 'Enter a price of ₦0 or more';
      });
    });
  if (Object.keys(errors).length) throw new ValidationError(errors);

  return {
    name,
    slug: slugify(name),
    description,
    categoryId: String(categoryId),
    price,
    photos,
    photoCredits,
    portion,
    prepTimeMins,
    isAvailable,
    availableDays: [...new Set(availableDays)].sort(),
    availableFrom,
    availableTo,
    optionGroups: groups.map((g) => ({
      id: typeof g.id === 'string' && g.id ? g.id : newId(),
      name: String(g.name).trim(),
      required: Boolean(g.required),
      max: Math.max(1, Math.min(Number.parseInt(g.max, 10) || 1, g.options.length)),
      options: g.options.map((o) => ({
        id: typeof o.id === 'string' && o.id ? o.id : newId(),
        name: String(o.name).trim().slice(0, 60),
        price: o.price ?? 0,
      })),
    })),
  };
};

// GET /vendor/menu (handoff section 3): search name, description; categoryId; availability
const MENU_LIST = {
  searchFields: ['name', 'description'],
  filters: {
    categoryId: 'categoryId',
    availability: ([value]) =>
      value === 'sold_out' ? { isAvailable: false } : value === 'available' ? { isAvailable: true } : undefined,
  },
  defaultSort: '-createdAt',
  sortable: {
    name: 'name',
    price: 'price',
    createdAt: 'createdAt',
    likesCount: 'likesCount',
    ordersCount: 'ordersCount',
  },
  include: categoryInclude,
};

/** GET /vendor/menu: every item, sold out too; meta.limits = { menuItems, photosPerItem, planName, used }. */
export const listMenu = async (user, query) => {
  const vendor = await ownVendor(user);
  const [{ data, meta }, limits, used] = await Promise.all([
    paginate(FoodItem, buildListQuery(query, MENU_LIST, { scope: { vendorId: vendor.id } })),
    planLimitsFor(vendor),
    FoodItem.count({ where: { vendorId: vendor.id } }),
  ]);
  return { data: data.map(toMenuItemDto), meta: { ...meta, limits: { ...limits, used } } };
};

const ownItem = async (vendor, id, transaction) => {
  const item = await FoodItem.findOne({
    where: { id, vendorId: vendor.id },
    include: categoryInclude,
    transaction,
    ...(transaction && { lock: transaction.LOCK.UPDATE }),
  });
  if (!item) throw new NotFoundError("We couldn't find that menu item.");
  return item;
};

/** GET /vendor/menu/{id}: the item plus the plan limits. */
export const getMenuItem = async (user, id) => {
  const vendor = await ownVendor(user);
  const [item, limits] = await Promise.all([ownItem(vendor, id), planLimitsFor(vendor)]);
  return { ...toMenuItemDto(item), limits };
};

/** POST /vendor/menu: within the plan's item limit (409 PLAN_LIMIT) and photo limit (422). */
export const createMenuItem = async (user, body) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction, lock: true });
    const limits = await planLimitsFor(vendor, { transaction });
    const used = await FoodItem.count({ where: { vendorId: vendor.id }, transaction });
    if (limits.menuItems != null && used >= limits.menuItems) {
      throw new ConflictError(
        'PLAN_LIMIT',
        `Your ${limits.planName} plan allows ${plural(limits.menuItems, 'menu item')}. Upgrade to add more.`,
      );
    }
    const fields = await readItem(user, body, limits, null, transaction);
    const item = await FoodItem.create({ vendorId: vendor.id, ...fields }, { transaction });
    await item.reload({ include: categoryInclude, transaction });
    return toMenuItemDto(item);
  });

/** PATCH /vendor/menu/{id}: any fields, or just `{ isAvailable }` to mark sold out / back on sale. */
export const updateMenuItem = async (user, id, body) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction });
    const item = await ownItem(vendor, id, transaction);
    const limits = await planLimitsFor(vendor, { transaction });
    const onlyAvailability = Object.keys(body).length === 1 && 'isAvailable' in body;
    if (onlyAvailability) {
      if (typeof body.isAvailable !== 'boolean')
        throw new ValidationError({ isAvailable: 'Choose available or sold out' });
      await item.update({ isAvailable: body.isAvailable }, { transaction });
    } else {
      // Photos above a (since lowered) plan limit may stay until they are changed
      const effective = { ...limits, photosPerItem: Math.max(limits.photosPerItem, item.photos.length) };
      const keepPhotos = body.photos === undefined;
      await item.update(await readItem(user, body, keepPhotos ? effective : limits, item, transaction), {
        transaction,
      });
    }
    await item.reload({ include: categoryInclude, transaction });
    return toMenuItemDto(item);
  });

/** DELETE /vendor/menu/{id}: soft delete; past orders keep their own copy of the dish. */
export const deleteMenuItem = async (user, id) =>
  withTransaction(async (transaction) => {
    const vendor = await ownVendor(user, { transaction });
    const item = await ownItem(vendor, id, transaction);
    await item.destroy({ transaction });
  });
