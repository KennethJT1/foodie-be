import { koboColumn } from '../columns.js';
import { idColumn } from '../id.js';

export const OFFER_STATUSES = ['pending', 'accepted', 'declined', 'expired'];

export default (sequelize, DataTypes) => {
  const DeliveryOffer = sequelize.define(
    'DeliveryOffer',
    {
      id: idColumn(),
      orderId: { type: DataTypes.UUID, allowNull: false },
      riderId: { type: DataTypes.UUID, allowNull: false },
      status: { type: DataTypes.ENUM(...OFFER_STATUSES), allowNull: false, defaultValue: 'pending' },
      fee: koboColumn(DataTypes, 'fee'),
      earning: koboColumn(DataTypes, 'earning'),
      distanceM: { type: DataTypes.INTEGER, allowNull: false },
      toPickupM: { type: DataTypes.INTEGER, allowNull: true },
      pickup: { type: DataTypes.JSON, allowNull: false },
      dropoff: { type: DataTypes.JSON, allowNull: false },
      expiresAt: { type: DataTypes.DATE(3), allowNull: false },
      respondedAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'delivery_offers' },
  );

  return DeliveryOffer;
};
