import { idColumn } from '../id.js';

export default (sequelize, DataTypes) =>
  sequelize.define(
    'Permission',
    {
      id: idColumn(),
      // dashboard.view, refunds.escalate...
      key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    },
    { tableName: 'permissions' },
  );
