import { idColumn } from '../id.js';
import { INTERVALS } from './subscription.model.js';

export default (sequelize, DataTypes) => {
  const SubscriptionInvoice = sequelize.define(
    'SubscriptionInvoice',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.UUID, allowNull: false },
      subscriptionId: { type: DataTypes.UUID, allowNull: false },
      planId: { type: DataTypes.UUID, allowNull: false },
      interval: { type: DataTypes.ENUM(...INTERVALS), allowNull: false },
      amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          return Number(this.getDataValue('amount'));
        },
      },
      status: { type: DataTypes.ENUM('paid', 'failed'), allowNull: false },
      reference: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      periodStart: { type: DataTypes.DATE(3), allowNull: true },
      periodEnd: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'subscription_invoices' },
  );

  return SubscriptionInvoice;
};
