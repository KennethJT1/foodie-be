import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const FoodItem = sequelize.define(
    'FoodItem',
    {
      id: idColumn(),
      vendorId: { type: DataTypes.STRING(64), allowNull: false },
      categoryId: { type: DataTypes.STRING(64), allowNull: false },
      name: { type: DataTypes.STRING(80), allowNull: false },
      slug: { type: DataTypes.STRING(90), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      // BIGINT kobo comes back as a string from mysql2; read as a number
      price: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          return Number(this.getDataValue('price'));
        },
      },
      photos: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      photoCredits: { type: DataTypes.JSON, allowNull: true },
      portion: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      prepTimeMins: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 20 },
      isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      availableDays: { type: DataTypes.JSON, allowNull: false, defaultValue: [0, 1, 2, 3, 4, 5, 6] },
      availableFrom: { type: DataTypes.CHAR(5), allowNull: true },
      availableTo: { type: DataTypes.CHAR(5), allowNull: true },
      optionGroups: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      likesCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      commentsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ordersCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isHidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      hiddenReason: { type: DataTypes.STRING(300), allowNull: true },
    },
    { tableName: 'food_items', paranoid: true },
  );

  FoodItem.associate = (models) => {
    FoodItem.belongsTo(models.Vendor, { as: 'vendor', foreignKey: 'vendorId' });
    FoodItem.belongsTo(models.Category, { as: 'category', foreignKey: 'categoryId' });
  };
  return FoodItem;
};
