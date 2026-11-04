import { idColumn } from '../id.js';

export const INTERVALS = ['monthly', 'yearly'];

export default (sequelize, DataTypes) => {
  const Subscription = sequelize.define(
    'Subscription',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      planId: { type: DataTypes.STRING(64), allowNull: false },
      interval: { type: DataTypes.ENUM(...INTERVALS), allowNull: false, defaultValue: 'monthly' },
      status: { type: DataTypes.ENUM('trial', 'active', 'grace', 'expired'), allowNull: false },
      currentPeriodStart: { type: DataTypes.DATE(3), allowNull: false },
      currentPeriodEnd: { type: DataTypes.DATE(3), allowNull: false },
      trialEndsAt: { type: DataTypes.DATE(3), allowNull: true },
      graceEndsAt: { type: DataTypes.DATE(3), allowNull: true },
      cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      scheduledPlanId: { type: DataTypes.STRING(64), allowNull: true },
      scheduledInterval: { type: DataTypes.ENUM(...INTERVALS), allowNull: true },
      paystackAuthorizationCode: { type: DataTypes.STRING(64), allowNull: true },
      paystackEmail: { type: DataTypes.STRING(191), allowNull: true },
      reminded7dAt: { type: DataTypes.DATE(3), allowNull: true, field: 'reminded_7d_at' },
      reminded1dAt: { type: DataTypes.DATE(3), allowNull: true, field: 'reminded_1d_at' },
    },
    { tableName: 'subscriptions' },
  );

  Subscription.associate = (models) => {
    Subscription.belongsTo(models.Vendor, { as: 'vendor', foreignKey: 'vendorId' });
    Subscription.belongsTo(models.Plan, { as: 'plan', foreignKey: 'planId' });
    Subscription.belongsTo(models.Plan, { as: 'scheduledPlan', foreignKey: 'scheduledPlanId' });
  };
  return Subscription;
};
