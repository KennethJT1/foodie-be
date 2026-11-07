import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const BankChangeRequest = sequelize.define(
    'BankChangeRequest',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.UUID, allowNull: false },
      bankCode: { type: DataTypes.STRING(20), allowNull: false },
      bankName: { type: DataTypes.STRING(120), allowNull: false },
      accountNumber: { type: DataTypes.STRING(10), allowNull: false },
      accountName: { type: DataTypes.STRING(120), allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      decidedBy: { type: DataTypes.UUID, allowNull: true },
      decidedAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'bank_change_requests' },
  );

  return BankChangeRequest;
};
