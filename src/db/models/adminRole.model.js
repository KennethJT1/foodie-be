import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const AdminRole = sequelize.define(
    'AdminRole',
    {
      id: idColumn(),
      // super_admin, support, finance, dispatch, onboarding: the API's role id and users.admin_role
      slug: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(60), allowNull: false },
      isLocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'admin_roles' },
  );

  return AdminRole;
};
