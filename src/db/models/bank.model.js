import { idColumn } from '../id.js';

export default (sequelize, DataTypes) =>
  sequelize.define(
    'Bank',
    {
      id: idColumn(),
      code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'banks' },
  );
