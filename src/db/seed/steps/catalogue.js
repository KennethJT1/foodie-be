// Categories, dishes and staff (handoff 8.3 / 8.4): Mama Put sells the first 14 dishes, every
// other approved vendor 5–10 random ones. Photos are the dish's real photos in order, up to the
// plan's photo limit, starting at a different photo per vendor; each keeps its credit.
import { slugify } from '../../../core/utils/index.js';
import { models, newId } from '../../index.js';
import { CATEGORIES, DISHES, GROUPS_BY_CATEGORY, OPTION_GROUPS, PORTIONS } from '../data/catalogue.js';
import { creditFor, SEED_IMAGES } from '../data/images.js';
import { PLANS } from '../data/reference.js';
import { mediaUrl } from '../media.js';

const { Category, FoodItem, Vendor, VendorStaff } = models;

const kobo = (naira) => Math.round(naira) * 100;
const roundTo = (n, step) => Math.round(n / step) * step;
const photoLimit = new Map(PLANS.map((p) => [p.id, p.photosPerItem]));

const optionGroupsFor = (faker, categoryId) => {
  const build = (key) => {
    const g = OPTION_GROUPS[key];
    return {
      id: newId(),
      name: g.name,
      required: g.required,
      max: g.max,
      options: g.options.map(([name, price]) => ({ id: newId(), name, price: kobo(price) })),
    };
  };
  const groups = [];
  if (GROUPS_BY_CATEGORY.protein.includes(categoryId)) groups.push(build('protein'));
  if (GROUPS_BY_CATEGORY.size.includes(categoryId)) groups.push(build('size'));
  if (GROUPS_BY_CATEGORY.sides.includes(categoryId) && faker.datatype.boolean()) groups.push(build('sides'));
  return groups;
};

/** Up to `count` of a dish's photos starting at `variant`, as our URLs with their credits. */
const photosFor = (dishName, count, variant) => {
  const sources = SEED_IMAGES.dishes[dishName] ?? [];
  const picked = Array.from(
    { length: Math.min(count, sources.length) },
    (_, i) => sources[(variant + i) % sources.length],
  );
  const photos = picked.map((p) => mediaUrl('food_photo', p.url));
  return { photos, photoCredits: picked.map((p, i) => ({ url: photos[i], ...creditFor(p.url) })) };
};

export const catalogue = async ({ transaction, faker, now }) => {
  await Category.bulkCreate(
    CATEGORIES.map((c) => {
      const firstDish = DISHES.find(([, categoryId]) => categoryId === c.id);
      return { ...c, imageUrl: firstDish ? photosFor(firstDish[0], 1, 0).photos[0] : null };
    }),
    { transaction },
  );

  const vendors = await Vendor.findAll({ where: { approvalStatus: 'approved' }, order: [['id', 'ASC']], transaction });
  const items = [];
  vendors.forEach((v, index) => {
    const dishes =
      v.id === 'ven_mama_put'
        ? DISHES.slice(0, 14)
        : faker.helpers.arrayElements(DISHES, faker.number.int({ min: 5, max: 10 }));
    const limit = photoLimit.get(v.planId) ?? 1;
    for (const [name, categoryId, min, max, description] of dishes) {
      const createdAt = faker.date.between({ from: v.approvedAt ?? v.createdAt, to: now });
      items.push({
        id: newId(),
        vendorId: v.id,
        categoryId,
        name,
        slug: slugify(name),
        description,
        price: kobo(roundTo(faker.number.int({ min, max }), 50)),
        ...photosFor(name, Math.min(limit, faker.number.int({ min: 1, max: 3 })), index),
        portion: faker.helpers.arrayElement(PORTIONS),
        prepTimeMins: faker.helpers.arrayElement([10, 15, 20, 30]),
        isAvailable: faker.datatype.boolean(0.92),
        availableDays: [0, 1, 2, 3, 4, 5, 6],
        optionGroups: optionGroupsFor(faker, categoryId),
        createdAt,
        updatedAt: createdAt,
      });
    }
  });
  await FoodItem.bulkCreate(items, { transaction });

  // Mama Put's two staff logins (a manager and a kitchen account)
  await VendorStaff.bulkCreate(
    ['manager', 'kitchen'].map((role) => {
      const first = faker.person.firstName();
      const last = faker.person.lastName();
      return {
        vendorId: 'ven_mama_put',
        name: `${first} ${last}`,
        email: `${slugify(`${first}.${last}`).replace(/-/g, '.')}@staff.kjtfoodie.test`,
        phone: `+234805${faker.string.numeric(7)}`,
        role,
        createdAt: faker.date.recent({ days: 60, refDate: now }),
      };
    }),
    { transaction },
  );
};
