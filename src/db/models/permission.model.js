export default (sequelize, DataTypes) =>
  sequelize.define(
    'Permission',
    { id: { type: DataTypes.STRING(64), primaryKey: true } },
    { tableName: 'permissions' },
  );
