// Plans and prices (BRD section 4, BR-SUB-07). Reference behaviour: foodie-fe
// src/mocks/handlers/subscriptions.js (GET /plans) and admin-ops.js (/admin/plans).
import { Op } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { NotFoundError, ValidationError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';
import { getSettings } from '../settings/settings.service.js';
import { PUBLIC_SUBSCRIPTION_STATUSES } from '../vendors/visibility.js';

const { Plan, Vendor } = models;

/** 12 × monthly minus the admin-set yearly discount (BRD section 4). */
export const yearlyPriceOf = (plan, settings) =>
  Math.round(plan.monthlyPrice * 12 * (1 - settings.yearlyDiscountPct / 100));

export const priceOf = (plan, interval, settings) =>
  interval === 'yearly' ? yearlyPriceOf(plan, settings) : plan.monthlyPrice;

/** Plan (contract). */
export const toPlanDto = (plan, settings) => ({
  id: plan.id,
  name: plan.name,
  monthlyPrice: plan.monthlyPrice,
  yearlyPrice: yearlyPriceOf(plan, settings),
  limits: { menuItems: plan.menuItemsLimit, photosPerItem: plan.photosPerItem, staff: plan.staffLimit },
  featured: plan.featured,
  analytics: plan.analytics,
  isPopular: plan.isPopular,
  isRetired: plan.isRetired,
  sortOrder: plan.sortOrder,
});

const planMeta = (settings) => ({ trialDays: settings.trialDays, yearlyDiscountPct: settings.yearlyDiscountPct });

const ORDER = [
  ['sortOrder', 'ASC'],
  ['monthlyPrice', 'ASC'],
];

/** GET /plans: plans on sale, cheapest first; meta carries the trial length and yearly discount. */
export const listPublicPlans = async () => {
  const [plans, settings] = await Promise.all([
    Plan.findAll({ where: { isRetired: false }, order: ORDER }),
    getSettings(),
  ]);
  return { data: plans.map((p) => toPlanDto(p, settings)), meta: planMeta(settings) };
};

/** GET /admin/plans: every plan, retired too, with how many live stores are on each. */
export const listAdminPlans = async () => {
  const [plans, settings, counts] = await Promise.all([
    Plan.findAll({ order: ORDER }),
    getSettings(),
    Vendor.count({
      where: { subscriptionStatus: PUBLIC_SUBSCRIPTION_STATUSES, planId: { [Op.ne]: null } },
      group: ['planId'],
    }),
  ]);
  const byPlan = new Map(counts.map((c) => [c.planId, c.count]));
  return {
    data: plans.map((p) => ({ ...toPlanDto(p, settings), vendorCount: byPlan.get(p.id) ?? 0 })),
    meta: planMeta(settings),
  };
};

const isWhole = (n, min, max = Infinity) => Number.isInteger(n) && n >= min && n <= max;

/** Validates a create / edit against the current plan (mock rules) → the columns to save. */
const readPlan = async (body, plan, transaction) => {
  const errors = {};
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 40) : plan?.name;
  if (!name || name.length < 2) errors.name = 'Name the plan';
  else if (await Plan.findOne({ where: { name, ...(plan && { id: { [Op.ne]: plan.id } }) }, transaction }))
    errors.name = 'Another plan has that name';

  const monthlyPrice = body.monthlyPrice !== undefined ? body.monthlyPrice : plan?.monthlyPrice;
  if (!isWhole(monthlyPrice, 1)) errors.monthlyPrice = 'Price must be more than ₦0';

  const limits = {
    menuItems: plan ? plan.menuItemsLimit : 20,
    photosPerItem: plan ? plan.photosPerItem : 1,
    staff: plan ? plan.staffLimit : 1,
    ...(body.limits && typeof body.limits === 'object' ? body.limits : {}),
  };
  if (limits.menuItems !== null && !isWhole(limits.menuItems, 1))
    errors['limits.menuItems'] = 'At least 1, or unlimited';
  if (!isWhole(limits.photosPerItem, 1, 10)) errors['limits.photosPerItem'] = 'Between 1 and 10';
  if (!isWhole(limits.staff, 1)) errors['limits.staff'] = 'At least 1';

  const pick = (key, allowed, fallback) => {
    if (body[key] === undefined) return plan?.[key] ?? fallback;
    if (!allowed.includes(body[key])) errors[key] = 'Pick one of the options';
    return body[key];
  };
  const featured = pick('featured', ['none', 'occasional', 'priority'], 'none');
  const analytics = pick('analytics', ['basic', 'full', 'export'], 'basic');
  const isPopular = pick('isPopular', [true, false], false);
  const isRetired = pick('isRetired', [true, false], false);
  if (Object.keys(errors).length) throw new ValidationError(errors);

  return {
    name,
    monthlyPrice,
    menuItemsLimit: limits.menuItems,
    photosPerItem: limits.photosPerItem,
    staffLimit: limits.staff,
    featured,
    analytics,
    isPopular,
    isRetired,
  };
};

/** POST /admin/plans and PATCH /admin/plans/{id}; only one plan can be "popular". Audited. */
export const savePlan = async (actor, id, body, req) => {
  const { saved, created } = await withTransaction(async (transaction) => {
    const plan = id ? await Plan.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }) : null;
    if (id && !plan) throw new NotFoundError("We couldn't find that plan.");
    const fields = await readPlan(body, plan, transaction);

    let row = plan;
    if (plan) await plan.update(fields, { transaction });
    else {
      const last = await Plan.max('sortOrder', { transaction });
      row = await Plan.create({ ...fields, sortOrder: (last ?? 0) + 1 }, { transaction });
    }
    if (row.isPopular) {
      await Plan.update({ isPopular: false }, { where: { id: { [Op.ne]: row.id } }, transaction });
    }
    await audit.log(
      {
        actor,
        action: plan ? 'plan.updated' : 'plan.created',
        targetType: 'plan',
        targetId: row.id,
        summary: `${row.name}: ₦${(row.monthlyPrice / 100).toLocaleString('en-NG')} a month${row.isRetired ? ' (retired)' : ''}`,
        req,
      },
      { transaction },
    );
    return { saved: row, created: !plan };
  });
  return { plan: toPlanDto(saved, await getSettings()), created };
};

// A store without a plan yet works within Basic's limits (as the mock)
const FALLBACK_LIMITS = { menuItems: 20, photosPerItem: 1, staff: 1, planName: 'Basic' };

/** The vendor's plan limits (BRD section 4): menu items (null = unlimited), photos per item, staff. */
export const planLimitsFor = async (vendor, { transaction } = {}) => {
  const plan = vendor.planId ? await Plan.findByPk(vendor.planId, { transaction }) : null;
  if (!plan) return { ...FALLBACK_LIMITS };
  return {
    menuItems: plan.menuItemsLimit,
    photosPerItem: plan.photosPerItem,
    staff: plan.staffLimit,
    planName: plan.name,
  };
};
