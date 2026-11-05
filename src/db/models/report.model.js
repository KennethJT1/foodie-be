import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const Report = sequelize.define(
    'Report',
    {
      id: idColumn(),
      reporterId: { type: DataTypes.UUID, allowNull: false },
      targetType: { type: DataTypes.ENUM('comment', 'food_item'), allowNull: false },
      targetId: { type: DataTypes.STRING(64), allowNull: false },
      reason: { type: DataTypes.STRING(200), allowNull: false },
      status: { type: DataTypes.ENUM('open', 'resolved', 'dismissed'), allowNull: false, defaultValue: 'open' },
      action: { type: DataTypes.ENUM('hide', 'remove', 'dismiss'), allowNull: true },
      resolvedBy: { type: DataTypes.UUID, allowNull: true },
      resolvedAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'reports' },
  );

  Report.associate = (models) => {
    Report.belongsTo(models.User, { as: 'reporter', foreignKey: 'reporterId' });
    Report.belongsTo(models.User, { as: 'resolver', foreignKey: 'resolvedBy' });
  };
  return Report;
};
