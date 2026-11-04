import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const VendorBankAccount = sequelize.define(
    'VendorBankAccount',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.STRING(64), allowNull: false },
      bankCode: { type: DataTypes.STRING(20), allowNull: false },
      bankName: { type: DataTypes.STRING(120), allowNull: false },
      accountNumber: { type: DataTypes.STRING(10), allowNull: false },
      accountName: { type: DataTypes.STRING(120), allowNull: false },
      status: { type: DataTypes.ENUM('active', 'replaced'), allowNull: false, defaultValue: 'active' },
      paystackSubaccountCode: { type: DataTypes.STRING(40), allowNull: true },
    },
    { tableName: 'vendor_bank_accounts' },
  );

  VendorBankAccount.associate = (models) => {
    VendorBankAccount.belongsTo(models.Vendor, { as: 'vendor', foreignKey: 'vendorId' });
  };
  return VendorBankAccount;
};
