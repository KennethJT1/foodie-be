import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const Follow = sequelize.define(
    'Follow',
    {
      id: idColumn(),
      userId: { type: DataTypes.UUID, allowNull: false },
      vendorId: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: 'follows' },
  );

  return Follow;
};
