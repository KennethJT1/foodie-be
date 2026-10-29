import { idColumn } from '../id.js';

export const NOTIFICATION_TYPES = ['order', 'refund', 'social', 'review', 'subscription', 'payout', 'system'];

export default (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: idColumn(),
      userId: { type: DataTypes.STRING(64), allowNull: false },
      type: { type: DataTypes.ENUM(...NOTIFICATION_TYPES), allowNull: false },
      title: { type: DataTypes.STRING(160), allowNull: false },
      body: { type: DataTypes.STRING(500), allowNull: false },
      // In-app path the bell opens, e.g. /orders/ord_123
      link: { type: DataTypes.STRING(255), allowNull: true },
      data: { type: DataTypes.JSON, allowNull: true },
      readAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'notifications' },
  );

  // Notification.belongsTo(User) is added with the users model in phase 6
  return Notification;
};
