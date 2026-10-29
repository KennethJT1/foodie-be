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

/** A role's live permissions: Redis first, then the database. super_admin always has all. */
export const rolePermissions = async (roleId) => {
  if (roleId === 'super_admin') return [...PERMISSIONS];
  const cached = await redis.get(cacheKey(roleId)).catch(() => null);
  if (cached) return JSON.parse(cached);

  const rows = await models.AdminRolePermission.findAll({ where: { roleId }, attributes: ['permissionId'] });
  // Keep the canonical order so the UI lists them consistently
  const granted = new Set(rows.map((row) => row.permissionId));
  const permissions = PERMISSIONS.filter((p) => granted.has(p));
  await redis.set(cacheKey(roleId), JSON.stringify(permissions), 'EX', ROLE_CACHE_TTL_SEC).catch(() => {});
  return permissions;
};

/** Call after a role's permissions change (every API instance reads the same Redis). */
export const invalidateRolePermissions = (roleIds) => redis.del(...[roleIds].flat().map(cacheKey)).catch(() => {});

/** The permissions a user holds right now (non-admins hold none). */
export const permissionsFor = async (user) =>
  user?.role === 'admin' && user.adminRole ? rolePermissions(user.adminRole) : [];

/**
 * Makes sure the five roles, every permission and the default sets exist. The migration inserts
 * them; seed wipes and test resets empty the tables, so the seeder and test factories call this.
 * Only missing roles get their defaults; existing roles are left as they are.
 */
export const ensureAdminRoles = async ({ transaction } = {}) => {
  const { AdminRole, Permission, AdminRolePermission } = models;
  await Permission.bulkCreate(
    PERMISSIONS.map((id) => ({ id })),
    { ignoreDuplicates: true, transaction },
  );

  const existing = new Set((await AdminRole.findAll({ attributes: ['id'], transaction })).map((r) => r.id));
  const missing = ADMIN_ROLES.filter((id) => !existing.has(id));
  if (!missing.length) return;

  await AdminRole.bulkCreate(
    missing.map((id) => ({ id, name: ROLE_NAMES[id], isLocked: id === 'super_admin' })),
    { transaction },
  );
  await AdminRolePermission.bulkCreate(
    missing.flatMap((roleId) => DEFAULT_ROLE_PERMISSIONS[roleId].map((permissionId) => ({ roleId, permissionId }))),
    { transaction },
  );
  await invalidateRolePermissions(missing);
};
