import { idColumn } from '../id.js';
import { APPROVAL_STATUSES } from './vendor.model.js';

// Minimal for now (sign-up and /me); phase 11 adds vehicle, documents, guarantor and bank
export default (sequelize, DataTypes) => {
  const Rider = sequelize.define(
    'Rider',
    {
      id: idColumn(),
      userId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      approvalStatus: { type: DataTypes.ENUM(...APPROVAL_STATUSES), allowNull: false, defaultValue: 'draft' },
      isOnline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'riders' },
  );

  Rider.associate = (models) => {
    Rider.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  };
  return Rider;
};
