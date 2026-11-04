import { idColumn } from '../id.js';

export const PLAN_FEATURED = ['none', 'occasional', 'priority'];
export const PLAN_ANALYTICS = ['basic', 'full', 'export'];

export default (sequelize, DataTypes) =>
  sequelize.define(
    'Plan',
    {
      id: idColumn(),
      name: { type: DataTypes.STRING(40), allowNull: false, unique: true },
      // BIGINT kobo comes back as a string from mysql2; read as a number
      monthlyPrice: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          return Number(this.getDataValue('monthlyPrice'));
        },
      },
      menuItemsLimit: { type: DataTypes.INTEGER, allowNull: true },
      photosPerItem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      staffLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      featured: { type: DataTypes.ENUM(...PLAN_FEATURED), allowNull: false, defaultValue: 'none' },
      analytics: { type: DataTypes.ENUM(...PLAN_ANALYTICS), allowNull: false, defaultValue: 'basic' },
      isPopular: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isRetired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'plans' },
  );
