import { idColumn } from '../id.js';

export const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'suspended'];
export const ONBOARDING_STEPS = ['type', 'business', 'location', 'documents', 'bank', 'review', 'submitted'];
export const SUBSCRIPTION_STATUSES = ['none', 'trial', 'active', 'grace', 'expired', 'cancelled'];

// Minimal for now (sign-up and /me); phase 10 adds the storefront and onboarding fields
export default (sequelize, DataTypes) => {
  const Vendor = sequelize.define(
    'Vendor',
    {
      id: idColumn(),
      ownerUserId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      slug: { type: DataTypes.STRING(120), allowNull: true, unique: true },
      type: { type: DataTypes.ENUM('restaurant', 'home_cook'), allowNull: true },
      logoUrl: { type: DataTypes.STRING(500), allowNull: true },
      approvalStatus: { type: DataTypes.ENUM(...APPROVAL_STATUSES), allowNull: false, defaultValue: 'draft' },
      onboardingStep: { type: DataTypes.ENUM(...ONBOARDING_STEPS), allowNull: false, defaultValue: 'type' },
      subscriptionStatus: { type: DataTypes.ENUM(...SUBSCRIPTION_STATUSES), allowNull: false, defaultValue: 'none' },
      planId: { type: DataTypes.STRING(64), allowNull: true },
      trialUsed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'vendors', paranoid: true },
  );

  Vendor.associate = (models) => {
    Vendor.belongsTo(models.User, { as: 'owner', foreignKey: 'ownerUserId' });
  };
  return Vendor;
};
