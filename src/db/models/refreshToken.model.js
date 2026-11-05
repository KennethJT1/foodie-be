import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: idColumn(),
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      familyId: { type: DataTypes.UUID, allowNull: false },
      expiresAt: { type: DataTypes.DATE(3), allowNull: false },
      revokedAt: { type: DataTypes.DATE(3), allowNull: true },
      revokedReason: {
        type: DataTypes.ENUM('rotated', 'logout', 'reuse', 'password_reset', 'deleted'),
        allowNull: true,
      },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      userAgent: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'refresh_tokens' },
  );

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
  };
  return RefreshToken;
};
