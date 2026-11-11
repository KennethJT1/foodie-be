export default (sequelize, DataTypes) =>
  sequelize.define(
    'AdminRolePermission',
    {
      roleId: { type: DataTypes.UUID, primaryKey: true },
      permissionId: { type: DataTypes.UUID, primaryKey: true },
    },
    { tableName: 'admin_role_permissions' },
  );
