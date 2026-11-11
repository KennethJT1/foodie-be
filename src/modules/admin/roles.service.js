import {
  ADMIN_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  invalidateRolePermissions,
  permissionIdsByKey,
  rolePermissions,
} from '../../core/auth/index.js';
import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';

const { AdminRole, AdminRolePermission } = models;

// The API's role id is the slug (super_admin, support...), as in users' adminRole
const toRole = async (role) => ({ id: role.slug, name: role.name, permissions: await rolePermissions(role.slug) });

/** GET /admin/roles: { roles: [{ id, name, permissions }], permissions: every permission }. */
export const listRoles = async () => {
  const roles = await AdminRole.findAll();
  const ordered = ADMIN_ROLES.map((slug) => roles.find((r) => r.slug === slug)).filter(Boolean);
  return { roles: await Promise.all(ordered.map(toRole)), permissions: [...PERMISSIONS] };
};

const findRole = async (slug) => {
  const role = await AdminRole.findOne({ where: { slug: String(slug) } });
  if (!role) throw new NotFoundError("We couldn't find that role.");
  return role;
};

const replacePermissions = async (role, permissions, { actor, req, reset = false }) => {
  const before = await rolePermissions(role.slug);
  const added = permissions.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !permissions.includes(p));
  await withTransaction(async (transaction) => {
    const permissionIds = await permissionIdsByKey({ transaction });
    await AdminRolePermission.destroy({ where: { roleId: role.id }, transaction });
    await AdminRolePermission.bulkCreate(
      permissions.map((key) => ({ roleId: role.id, permissionId: permissionIds.get(key) })),
      { transaction },
    );
    await audit.log(
      {
        actor,
        action: reset ? 'role.reset' : 'role.updated',
        targetType: 'role',
        targetId: role.slug,
        summary: reset
          ? `${role.slug} back to defaults`
          : `${role.slug}: +${added.join(', ') || 'none'} −${removed.join(', ') || 'none'}`,
        req,
      },
      { transaction },
    );
  });
  await invalidateRolePermissions(role.slug);
  return toRole(role);
};

/** PATCH /admin/roles/{id}: super_admin is locked; every role keeps dashboard.view. */
export const updateRole = async (actor, id, { permissions }, req) => {
  const role = await findRole(id);
  if (role.isLocked) throw new ConflictError('CONFLICT', 'The super admin role always has every permission.');
  if (permissions.some((p) => !PERMISSIONS.includes(p))) {
    throw new ValidationError({ permissions: 'Pick permissions from the list' });
  }
  if (!permissions.includes('dashboard.view'))
    throw new ValidationError({ permissions: 'Every role needs the overview' });
  return replacePermissions(role, [...new Set(permissions)], { actor, req });
};

/** POST /admin/roles/{id}/reset: back to the handoff defaults. */
export const resetRole = async (actor, id, req) => {
  const role = await findRole(id);
  return replacePermissions(role, [...DEFAULT_ROLE_PERMISSIONS[role.slug]], { actor, req, reset: true });
};
