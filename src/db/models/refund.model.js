import { koboColumn } from '../columns.js';
import { idColumn } from '../id.js';

export const REFUND_STATUSES = ['requested', 'accepted', 'rejected', 'paid', 'confirmed', 'disputed', 'escalated'];

export default (sequelize, DataTypes) => {
  const Refund = sequelize.define(
    'Refund',
    {
      id: idColumn(),
      orderId: { type: DataTypes.UUID, allowNull: false, unique: true },
      customerId: { type: DataTypes.UUID, allowNull: false },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      orderCode: { type: DataTypes.CHAR(6), allowNull: false },
      customerName: { type: DataTypes.STRING(121), allowNull: false },
      vendorName: { type: DataTypes.STRING(120), allowNull: false },
      reason: { type: DataTypes.STRING(100), allowNull: false },
      details: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      amount: koboColumn(DataTypes, 'amount'),
      orderSubtotal: koboColumn(DataTypes, 'orderSubtotal'),
      photos: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      status: { type: DataTypes.ENUM(...REFUND_STATUSES), allowNull: false, defaultValue: 'requested' },
      deadline: { type: DataTypes.DATE(3), allowNull: false },
      vendorResponse: { type: DataTypes.JSON, allowNull: true },
      paymentReference: { type: DataTypes.STRING(60), allowNull: true },
      escalated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      timeline: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      comments: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      deadlineHandledAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'refunds' },
  );

  return Refund;
};
