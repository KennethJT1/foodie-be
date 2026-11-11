import { idColumn } from '../id.js';

export default (sequelize, DataTypes) =>
  sequelize.define(
    'Setting',
    {
      id: idColumn(),
      key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      value: { type: DataTypes.JSON, allowNull: false },
    },
    { tableName: 'settings' },
  );
