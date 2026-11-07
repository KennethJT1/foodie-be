import { koboColumn } from '../columns.js';
import { idColumn } from '../id.js';

export const DELIVERY_STATUSES = ['assigned', 'picked_up', 'delivered', 'cancelled'];

export default (sequelize, DataTypes) => {
  const Delivery = sequelize.define(
    'Delivery',
    {
      id: idColumn(),
      orderId: { type: DataTypes.UUID, allowNull: false, unique: true },
      riderId: { type: DataTypes.UUID, allowNull: false },
      status: { type: DataTypes.ENUM(...DELIVERY_STATUSES), allowNull: false, defaultValue: 'assigned' },
      fee: koboColumn(DataTypes, 'fee'),
      payoutPct: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      riderEarning: koboColumn(DataTypes, 'riderEarning'),
      distanceM: { type: DataTypes.INTEGER, allowNull: false },
      pickup: { type: DataTypes.JSON, allowNull: false },
      dropoff: { type: DataTypes.JSON, allowNull: false },
      route: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      assignedAt: { type: DataTypes.DATE(3), allowNull: false },
      pickedUpAt: { type: DataTypes.DATE(3), allowNull: true },
      deliveredAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'deliveries' },
  );

  return Delivery;
};
