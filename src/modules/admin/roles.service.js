import {
  ADMIN_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  invalidateRolePermissions,
  rolePermissions,
} from '../../core/auth/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';

const { AdminRole, AdminRolePermission } = models;

const toRole = async (role) => ({ id: role.id, name: role.name, permissions: await rolePermissions(role.id) });

/** GET /admin/roles: { roles: [{ id, name, permissions }], permissions: every permission }. */
export const listRoles = async () => {
  const roles = await AdminRole.findAll();
  const ordered = ADMIN_ROLES.map((id) => roles.find((r) => r.id === id)).filter(Boolean);
  return { roles: await Promise.all(ordered.map(toRole)), permissions: [...PERMISSIONS] };
};

const findRole = async (id) => {
  const role = await AdminRole.findByPk(id);
  if (!role) throw new NotFoundError("We couldn't find that role.");
  return role;
};

const replacePermissions = async (role, permissions) => {
  await withTransaction(async (transaction) => {
    await AdminRolePermission.destroy({ where: { roleId: role.id }, transaction });
    await AdminRolePermission.bulkCreate(
      permissions.map((permissionId) => ({ roleId: role.id, permissionId })),
      { transaction },
    );
  });
  await invalidateRolePermissions(role.id);
  return toRole(role);
};

/** PATCH /admin/roles/{id}: super_admin is locked; every role keeps dashboard.view. */
export const updateRole = async (id, { permissions }) => {
  const role = await findRole(id);
  if (role.isLocked) throw new ConflictError('CONFLICT', 'The super admin role always has every permission.');
  if (permissions.some((p) => !PERMISSIONS.includes(p))) {
    throw new ValidationError({ permissions: 'Pick permissions from the list' });
  }
  if (!permissions.includes('dashboard.view'))
    throw new ValidationError({ permissions: 'Every role needs the overview' });
  return replacePermissions(role, [...new Set(permissions)]);
};

/** POST /admin/roles/{id}/reset: back to the handoff defaults. */
export const resetRole = async (id) => {
  const role = await findRole(id);
  return replacePermissions(role, [...DEFAULT_ROLE_PERMISSIONS[role.id]]);
};
