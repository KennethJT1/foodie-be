import { numberGetter } from '../columns.js';
import { idColumn } from '../id.js';

export const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'suspended'];
export const ONBOARDING_STEPS = ['type', 'business', 'location', 'documents', 'bank', 'review', 'submitted'];
export const SUBSCRIPTION_STATUSES = ['none', 'trial', 'active', 'grace', 'expired', 'cancelled'];
export const VENDOR_TYPES = ['restaurant', 'home_cook'];

export default (sequelize, DataTypes) => {
  const Vendor = sequelize.define(
    'Vendor',
    {
      id: idColumn(),
      ownerUserId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      slug: { type: DataTypes.STRING(120), allowNull: true, unique: true },
      type: { type: DataTypes.ENUM(...VENDOR_TYPES), allowNull: true },
      description: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      logoUrl: { type: DataTypes.STRING(500), allowNull: true },
      coverUrl: { type: DataTypes.STRING(500), allowNull: true },
      addressLine1: { type: DataTypes.STRING(200), allowNull: true },
      area: { type: DataTypes.STRING(100), allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      state: { type: DataTypes.STRING(100), allowNull: true },
      lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true, get: numberGetter('lat') },
      lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true, get: numberGetter('lng') },
      deliveryRadiusKm: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 5,
        get: numberGetter('deliveryRadiusKm'),
      },
      prepTimeMins: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 20 },
      isPaused: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      approvalStatus: { type: DataTypes.ENUM(...APPROVAL_STATUSES), allowNull: false, defaultValue: 'draft' },
      onboardingStep: { type: DataTypes.ENUM(...ONBOARDING_STEPS), allowNull: false, defaultValue: 'type' },
      rejectionReason: { type: DataTypes.STRING(500), allowNull: true },
      suspensionReason: { type: DataTypes.STRING(500), allowNull: true },
      submittedAt: { type: DataTypes.DATE(3), allowNull: true },
      approvedAt: { type: DataTypes.DATE(3), allowNull: true },
      subscriptionStatus: { type: DataTypes.ENUM(...SUBSCRIPTION_STATUSES), allowNull: false, defaultValue: 'none' },
      planId: { type: DataTypes.STRING(64), allowNull: true },
      trialUsed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      rating: { type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 0, get: numberGetter('rating') },
      ratingCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      followersCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      refundRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        get: numberGetter('refundRate'),
      },
    },
    { tableName: 'vendors', paranoid: true },
  );

  Vendor.associate = (models) => {
    Vendor.belongsTo(models.User, { as: 'owner', foreignKey: 'ownerUserId' });
    Vendor.belongsTo(models.Plan, { as: 'plan', foreignKey: 'planId' });
    Vendor.hasOne(models.Subscription, { as: 'subscription', foreignKey: 'vendorId' });
    Vendor.hasMany(models.VendorDocument, { as: 'documents', foreignKey: 'vendorId' });
    Vendor.hasMany(models.VendorOpeningHour, { as: 'openingHours', foreignKey: 'vendorId' });
    Vendor.hasMany(models.VendorBankAccount, { as: 'bankAccounts', foreignKey: 'vendorId' });
    Vendor.hasMany(models.BankChangeRequest, { as: 'bankChangeRequests', foreignKey: 'vendorId' });
  };
  return Vendor;
};
