import { idColumn } from '../id.js';

export const REVIEW_TARGETS = ['vendor', 'rider'];

export default (sequelize, DataTypes) => {
  const Review = sequelize.define(
    'Review',
    {
      id: idColumn(),
      orderId: { type: DataTypes.UUID, allowNull: false },
      targetType: { type: DataTypes.ENUM(...REVIEW_TARGETS), allowNull: false },
      targetId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      userName: { type: DataTypes.STRING(121), allowNull: false },
      rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      comment: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      reply: { type: DataTypes.STRING(500), allowNull: true },
      repliedAt: { type: DataTypes.DATE(3), allowNull: true },
    },
    { tableName: 'reviews' },
  );

  return Review;
};
