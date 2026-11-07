export default (sequelize, DataTypes) => {
  const AdminRole = sequelize.define(
    'AdminRole',
    {
      id: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(60), allowNull: false },
      isLocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'admin_roles' },
  );

  return AdminRole;
};
