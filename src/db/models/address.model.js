import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const Address = sequelize.define(
    'Address',
    {
      id: idColumn(),
      userId: { type: DataTypes.STRING(64), allowNull: false },
      label: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'Home' },
      line1: { type: DataTypes.STRING(200), allowNull: false },
      area: { type: DataTypes.STRING(100), allowNull: false },
      city: { type: DataTypes.STRING(100), allowNull: false },
      state: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      // DECIMAL comes back from MySQL as a string; read as numbers
      lat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
        get() {
          return Number(this.getDataValue('lat'));
        },
      },
      lng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
        get() {
          return Number(this.getDataValue('lng'));
        },
      },
      directions: { type: DataTypes.STRING(300), allowNull: true },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'addresses' },
  );

  Address.associate = (models) => {
    Address.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  };
  return Address;
};
