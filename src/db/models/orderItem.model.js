import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const OrderItem = sequelize.define(
    'OrderItem',
    {
      id: idColumn(),
      orderId: { type: DataTypes.STRING(64), allowNull: false },
      foodItemId: { type: DataTypes.STRING(64), allowNull: false },
      name: { type: DataTypes.STRING(80), allowNull: false },
      unitPrice: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          return Number(this.getDataValue('unitPrice'));
        },
      },
      quantity: { type: DataTypes.SMALLINT, allowNull: false },
      options: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      lineTotal: {
        type: DataTypes.BIGINT,
        allowNull: false,
        get() {
          return Number(this.getDataValue('lineTotal'));
        },
      },
      sortOrder: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'order_items' },
  );

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, { as: 'order', foreignKey: 'orderId' });
  };
  return OrderItem;
};
