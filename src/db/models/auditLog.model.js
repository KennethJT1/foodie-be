import { idColumn } from '../id.js';

export default (sequelize, DataTypes) =>
  sequelize.define(
    'AuditLog',
    {
      id: idColumn(),
      actorId: { type: DataTypes.STRING(64), allowNull: true },
      actorName: { type: DataTypes.STRING(120), allowNull: false },
      actorRole: { type: DataTypes.STRING(32), allowNull: false },
      action: { type: DataTypes.STRING(64), allowNull: false },
      targetType: { type: DataTypes.STRING(32), allowNull: false },
      targetId: { type: DataTypes.STRING(64), allowNull: false },
      summary: { type: DataTypes.STRING(500), allowNull: false },
      ip: { type: DataTypes.STRING(45), allowNull: true },
    },
    // Append-only: entries are never edited
    { tableName: 'audit_logs', updatedAt: false },
  );
