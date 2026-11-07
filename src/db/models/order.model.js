import { idColumn } from '../id.js';

export const ORDER_STATUSES = [
  'paid',
  'accepted',
  'rejected',
  'preparing',
  'ready_for_pickup',
  'rider_assigned',
  'picked_up',
  'delivered',
  'cancelled',
];
/** The happy path, in order (BRD section 7). */
export const ORDER_FLOW = [
  'paid',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'rider_assigned',
  'picked_up',
  'delivered',
];
export const ACTIVE_ORDER_STATUSES = ORDER_FLOW.slice(0, -1);

// BIGINT kobo comes back as a string from mysql2; read as a number
const kobo = (DataTypes, name) => ({
  type: DataTypes.BIGINT,
  allowNull: false,
  defaultValue: 0,
  get() {
    return Number(this.getDataValue(name));
  },
});

export default (sequelize, DataTypes) => {
  const Order = sequelize.define(
    'Order',
    {
      id: idColumn(),
      code: { type: DataTypes.CHAR(6), allowNull: false, unique: true },
      customerId: { type: DataTypes.UUID, allowNull: false },
      vendorId: { type: DataTypes.UUID, allowNull: false },
      riderId: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.ENUM(...ORDER_STATUSES), allowNull: false, defaultValue: 'paid' },
      customerName: { type: DataTypes.STRING(121), allowNull: false },
      customerPhone: { type: DataTypes.STRING(20), allowNull: true },
      vendorName: { type: DataTypes.STRING(120), allowNull: false },
      vendorSlug: { type: DataTypes.STRING(120), allowNull: true },
      subtotal: kobo(DataTypes, 'subtotal'),
      deliveryFee: kobo(DataTypes, 'deliveryFee'),
      processingFee: kobo(DataTypes, 'processingFee'),
      total: kobo(DataTypes, 'total'),
      address: { type: DataTypes.JSON, allowNull: false },
      deliveryNote: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      scheduledFor: { type: DataTypes.DATE(3), allowNull: true },
      deliveryCode: { type: DataTypes.CHAR(4), allowNull: false },
      distanceM: { type: DataTypes.INTEGER, allowNull: false },
      etaMinMins: { type: DataTypes.SMALLINT, allowNull: false },
      etaMaxMins: { type: DataTypes.SMALLINT, allowNull: false },
      acceptDeadline: { type: DataTypes.DATE(3), allowNull: false },
      statusHistory: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      cancelReason: { type: DataTypes.STRING(200), allowNull: true },
      ratedVendor: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ratedRider: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      paymentReference: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    },
    { tableName: 'orders' },
  );

  return Order;
};
