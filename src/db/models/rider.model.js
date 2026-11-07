import { numberGetter } from '../columns.js';
import { idColumn } from '../id.js';
import { APPROVAL_STATUSES } from './vendor.model.js';

export const RIDER_STEPS = ['vehicle', 'guarantor', 'documents', 'bank', 'review', 'submitted'];
export const VEHICLE_TYPES = ['motorcycle', 'bicycle', 'car'];

export default (sequelize, DataTypes) => {
  const Rider = sequelize.define(
    'Rider',
    {
      id: idColumn(),
      userId: { type: DataTypes.UUID, allowNull: false, unique: true },
      approvalStatus: { type: DataTypes.ENUM(...APPROVAL_STATUSES), allowNull: false, defaultValue: 'draft' },
      onboardingStep: { type: DataTypes.ENUM(...RIDER_STEPS), allowNull: false, defaultValue: 'vehicle' },
      vehicleType: { type: DataTypes.ENUM(...VEHICLE_TYPES), allowNull: true },
      plateNumber: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      licenceNumber: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      guarantorName: { type: DataTypes.STRING(120), allowNull: true },
      guarantorPhone: { type: DataTypes.STRING(20), allowNull: true },
      guarantorRelationship: { type: DataTypes.STRING(60), allowNull: true },
      guarantorAddress: { type: DataTypes.STRING(300), allowNull: true },
      rejectionReason: { type: DataTypes.STRING(500), allowNull: true },
      suspensionReason: { type: DataTypes.STRING(500), allowNull: true },
      submittedAt: { type: DataTypes.DATE(3), allowNull: true },
      approvedAt: { type: DataTypes.DATE(3), allowNull: true },
      isOnline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      city: { type: DataTypes.STRING(100), allowNull: true },
      lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true, get: numberGetter('lat') },
      lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true, get: numberGetter('lng') },
      lastSeenAt: { type: DataTypes.DATE(3), allowNull: true },
      rating: { type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 0, get: numberGetter('rating') },
      ratingCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      tripsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'riders' },
  );

  return Rider;
};
