export default (sequelize, DataTypes) =>
  sequelize.define(
    'AdminRolePermission',
    {
      roleId: { type: DataTypes.STRING(32), primaryKey: true },
      permissionId: { type: DataTypes.STRING(64), primaryKey: true },
    },
    { tableName: 'admin_role_permissions' },
  );
