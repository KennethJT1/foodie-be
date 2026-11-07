import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const Comment = sequelize.define(
    'Comment',
    {
      id: idColumn(),
      foodItemId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      parentId: { type: DataTypes.UUID, allowNull: true },
      isVendorReply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      body: { type: DataTypes.STRING(500), allowNull: false },
      editedAt: { type: DataTypes.DATE(3), allowNull: true },
      removed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'comments' },
  );

  return Comment;
};
