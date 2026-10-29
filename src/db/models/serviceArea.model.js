import { idColumn } from '../id.js';

const coordinate = (DataTypes, name) => ({
  type: DataTypes.DECIMAL(10, 7),
  allowNull: true,
  // DECIMAL comes back from MySQL as a string
  get() {
    const value = this.getDataValue(name);
    return value === null || value === undefined ? null : Number(value);
  },
});

export default (sequelize, DataTypes) =>
  sequelize.define(
    'ServiceArea',
    {
      id: idColumn(),
      name: { type: DataTypes.STRING(60), allowNull: false },
      state: { type: DataTypes.STRING(60), allowNull: true },
      lat: coordinate(DataTypes, 'lat'),
      lng: coordinate(DataTypes, 'lng'),
      areas: { type: DataTypes.JSON, allowNull: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'service_areas' },
  );
