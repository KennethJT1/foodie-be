import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const VendorOpeningHour = sequelize.define(
    'VendorOpeningHour',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.UUID, allowNull: false },
      // 0 = Sunday
      day: { type: DataTypes.TINYINT, allowNull: false },
      opensAt: { type: DataTypes.CHAR(5), allowNull: false, defaultValue: '09:00' },
      closesAt: { type: DataTypes.CHAR(5), allowNull: false, defaultValue: '21:00' },
      isClosed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'vendor_opening_hours' },
  );

  VendorOpeningHour.associate = (models) => {
    VendorOpeningHour.belongsTo(models.Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  };
  return VendorOpeningHour;
};
