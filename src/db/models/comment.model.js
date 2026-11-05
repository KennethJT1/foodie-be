import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const Comment = sequelize.define(
    'Comment',
    {
      id: idColumn(),
      foodItemId: { type: DataTypes.STRING(64), allowNull: false },
      userId: { type: DataTypes.STRING(64), allowNull: false },
      parentId: { type: DataTypes.STRING(64), allowNull: true },
      isVendorReply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      body: { type: DataTypes.STRING(500), allowNull: false },
      editedAt: { type: DataTypes.DATE(3), allowNull: true },
      removed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'comments' },
  );

  Comment.associate = (models) => {
    Comment.belongsTo(models.User, { as: 'author', foreignKey: 'userId' });
    Comment.belongsTo(models.FoodItem, { as: 'foodItem', foreignKey: 'foodItemId' });
    Comment.belongsTo(models.Comment, { as: 'parent', foreignKey: 'parentId' });
    Comment.hasMany(models.Comment, { as: 'replies', foreignKey: 'parentId' });
  };
  return Comment;
};
