export default (sequelize, DataTypes) =>
  sequelize.define(
    'Bank',
    {
      code: { type: DataTypes.STRING(20), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'banks' },
  );
