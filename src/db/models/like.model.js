import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const Like = sequelize.define(
    'Like',
    {
      id: idColumn(),
      userId: { type: DataTypes.UUID, allowNull: false },
      foodItemId: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: 'likes' },
  );

  return Like;
};
