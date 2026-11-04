import { idColumn } from '../id.js';

export default (sequelize, DataTypes) =>
  sequelize.define(
    'PaymentEvent',
    {
      id: idColumn(),
      provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'paystack' },
      eventId: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      eventType: { type: DataTypes.STRING(60), allowNull: false },
      reference: { type: DataTypes.STRING(64), allowNull: true },
      payload: { type: DataTypes.JSON, allowNull: false },
      processedAt: { type: DataTypes.DATE(3), allowNull: true },
      error: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'payment_events' },
  );
