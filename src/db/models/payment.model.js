import { idColumn } from '../id.js';

const koboColumn = (DataTypes, name) => ({
  type: DataTypes.BIGINT,
  allowNull: false,
  defaultValue: 0,
  get() {
    return Number(this.getDataValue(name));
  },
});

export default (sequelize, DataTypes) => {
  const Payment = sequelize.define(
    'Payment',
    {
      id: idColumn(),
      reference: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      type: { type: DataTypes.ENUM('order', 'subscription'), allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: true },
      vendorId: { type: DataTypes.UUID, allowNull: true },
      orderId: { type: DataTypes.UUID, allowNull: true },
      amount: koboColumn(DataTypes, 'amount'),
      vendorShare: koboColumn(DataTypes, 'vendorShare'),
      platformShare: koboColumn(DataTypes, 'platformShare'),
      fee: koboColumn(DataTypes, 'fee'),
      channel: { type: DataTypes.STRING(20), allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'success', 'failed', 'abandoned', 'refunded'),
        allowNull: false,
        defaultValue: 'pending',
      },
      settlementStatus: { type: DataTypes.ENUM('settling', 'settled', 'refunded'), allowNull: true },
      flag: { type: DataTypes.STRING(40), allowNull: true },
      reconciled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      accessCode: { type: DataTypes.STRING(64), allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: true },
      paidAt: { type: DataTypes.DATE(3), allowNull: true },
      settledAt: { type: DataTypes.DATE(3), allowNull: true },
      refundedAt: { type: DataTypes.DATE(3), allowNull: true },
      reconcileNote: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'payments' },
  );

  return Payment;
};
