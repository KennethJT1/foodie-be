import { idColumn } from '../id.js';

export default (sequelize, DataTypes) =>
  sequelize.define(
    'Category',
    {
      id: idColumn(),
      name: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      slug: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      icon: { type: DataTypes.STRING(16), allowNull: true },
      imageUrl: { type: DataTypes.STRING(500), allowNull: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'categories' },
  );
