export default (sequelize, DataTypes) =>
  sequelize.define(
    'Setting',
    {
      key: { type: DataTypes.STRING(64), primaryKey: true },
      value: { type: DataTypes.JSON, allowNull: false },
    },
    { tableName: 'settings' },
  );
