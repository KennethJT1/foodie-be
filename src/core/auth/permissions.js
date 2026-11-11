import { redis, redisPrefix } from '../../config/redis.js';
import { models } from '../../db/index.js';

// Admin permissions (05-backend-handoff.md, section 2 "Roles and admin permissions"); the same
// names as the frontend's src/constants/permissions.js.
export const PERMISSIONS = Object.freeze([
  'dashboard.view',
  'vendors.view',
  'vendors.approve',
  'riders.view',
  'riders.approve',
  'customers.view',
  'customers.ban',
  'orders.view',
  'orders.reassign',
  'live_map.view',
  'payments.view',
  'subscriptions.view',
  'subscriptions.manage',
  'payouts.manage',
  'refunds.view',
  'refunds.escalate',
  'moderation.manage',
  'support.manage',
  'settings.manage',
  'admin_users.manage',
  'audit_log.view',
  'reports.export',
]);

export const ADMIN_ROLES = Object.freeze(['super_admin', 'support', 'finance', 'dispatch', 'onboarding']);

export const ROLE_NAMES = Object.freeze({
  super_admin: 'Super admin',
  support: 'Support',
  finance: 'Finance',
  dispatch: 'Dispatch',
  onboarding: 'Onboarding',
});

// Default set per admin sub-role: what the roles table starts with, and what
// POST /admin/roles/{id}/reset restores. The live sets are in admin_role_permissions.
// Each list is in PERMISSIONS order, the order rolePermissions() returns.
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  super_admin: PERMISSIONS,
  support: [
    'dashboard.view',
    'vendors.view',
    'riders.view',
    'customers.view',
    'orders.view',
    'refunds.view',
    'refunds.escalate',
    'moderation.manage',
    'support.manage',
  ],
  finance: [
    'dashboard.view',
    'orders.view',
    'payments.view',
    'subscriptions.view',
    'subscriptions.manage',
    'payouts.manage',
    'refunds.view',
    'reports.export',
  ],
  dispatch: ['dashboard.view', 'riders.view', 'orders.view', 'orders.reassign', 'live_map.view'],
  onboarding: ['dashboard.view', 'vendors.view', 'vendors.approve', 'riders.view', 'riders.approve'],
});

const ROLE_CACHE_TTL_SEC = 600;
const cacheKey = (roleId) => `${redisPrefix}:perm:role:${roleId}`;

/** A role's live permissions (by slug): Redis first, then the database. super_admin always has all. */
export const rolePermissions = async (roleId) => {
  if (roleId === 'super_admin') return [...PERMISSIONS];
  const cached = await redis.get(cacheKey(roleId)).catch(() => null);
  if (cached) return JSON.parse(cached);

  const role = await models.AdminRole.findOne({
    where: { slug: roleId },
    include: [{ model: models.Permission, as: 'permissions', attributes: ['key'], through: { attributes: [] } }],
  });
  // Keep the canonical order so the UI lists them consistently
  const granted = new Set((role?.permissions ?? []).map((p) => p.key));
  const permissions = PERMISSIONS.filter((p) => granted.has(p));
  await redis.set(cacheKey(roleId), JSON.stringify(permissions), 'EX', ROLE_CACHE_TTL_SEC).catch(() => {});
  return permissions;
};

/** Call after a role's permissions change (every API instance reads the same Redis). */
export const invalidateRolePermissions = (roleIds) => redis.del(...[roleIds].flat().map(cacheKey)).catch(() => {});

/** The permissions a user holds right now (non-admins hold none). */
export const permissionsFor = async (user) =>
  user?.role === 'admin' && user.adminRole ? rolePermissions(user.adminRole) : [];

/** Map of permission key (dashboard.view) → permissions.id. */
export const permissionIdsByKey = async ({ transaction } = {}) =>
  new Map((await models.Permission.findAll({ attributes: ['id', 'key'], transaction })).map((p) => [p.key, p.id]));

/**
 * Makes sure the five roles, every permission and the default sets exist. The migration inserts
 * them; seed wipes and test resets empty the tables, so the seeder and test factories call this.
 * Only missing roles get their defaults; existing roles are left as they are.
 */
export const ensureAdminRoles = async ({ transaction } = {}) => {
  const { AdminRole, Permission, AdminRolePermission } = models;
  await Permission.bulkCreate(
    PERMISSIONS.map((key) => ({ key })),
    { ignoreDuplicates: true, transaction },
  );

  const existing = new Set((await AdminRole.findAll({ attributes: ['slug'], transaction })).map((r) => r.slug));
  const missing = ADMIN_ROLES.filter((slug) => !existing.has(slug));
  if (!missing.length) return;

  const created = await AdminRole.bulkCreate(
    missing.map((slug) => ({ slug, name: ROLE_NAMES[slug], isLocked: slug === 'super_admin' })),
    { transaction },
  );
  const permissionIds = await permissionIdsByKey({ transaction });
  await AdminRolePermission.bulkCreate(
    created.flatMap((role) =>
      DEFAULT_ROLE_PERMISSIONS[role.slug].map((key) => ({ roleId: role.id, permissionId: permissionIds.get(key) })),
    ),
    { transaction },
  );
  await invalidateRolePermissions(missing);
};

/** Active admins who hold `permission` now (who to tell about a new application, a dispute...). */
export const adminsWithPermission = async (permission, { transaction } = {}) => {
  const admins = await models.User.findAll({ where: { role: 'admin', status: 'active' }, transaction });
  const allowed = await Promise.all(admins.map(async (u) => (await permissionsFor(u)).includes(permission)));
  return admins.filter((u, i) => allowed[i]);
};
