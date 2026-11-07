import { koboColumn } from '../columns.js';
import { idColumn } from '../id.js';

export const PAYOUT_STATUSES = ['draft', 'approved', 'paid'];

export default (sequelize, DataTypes) => {
  const RiderPayoutStatement = sequelize.define(
    'RiderPayoutStatement',
    {
      id: idColumn(),
      riderId: { type: DataTypes.UUID, allowNull: false },
      month: { type: DataTypes.CHAR(7), allowNull: false },
      trips: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      deliveryFees: koboColumn(DataTypes, 'deliveryFees'),
      payoutPct: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      amount: koboColumn(DataTypes, 'amount'),
      adjustments: koboColumn(DataTypes, 'adjustments'),
      status: { type: DataTypes.ENUM(...PAYOUT_STATUSES), allowNull: false, defaultValue: 'draft' },
      reference: { type: DataTypes.STRING(60), allowNull: true },
      approvedAt: { type: DataTypes.DATE(3), allowNull: true },
      approvedBy: { type: DataTypes.UUID, allowNull: true },
      paidAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'rider_payout_statements' },
  );

  return RiderPayoutStatement;
};
