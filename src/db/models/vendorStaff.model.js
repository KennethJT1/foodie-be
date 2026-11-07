import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const VendorStaff = sequelize.define(
    'VendorStaff',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      role: { type: DataTypes.ENUM('manager', 'kitchen'), allowNull: false },
    },
    { tableName: 'vendor_staff' },
  );

  return VendorStaff;
};
