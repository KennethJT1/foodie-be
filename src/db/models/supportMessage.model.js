import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const SupportMessage = sequelize.define(
    'SupportMessage',
    {
      id: idColumn(),
      ticketId: { type: DataTypes.UUID, allowNull: false },
      authorId: { type: DataTypes.UUID, allowNull: false },
      authorName: { type: DataTypes.STRING(121), allowNull: false },
      authorRole: { type: DataTypes.ENUM('customer', 'vendor', 'rider', 'admin'), allowNull: false },
      body: { type: DataTypes.STRING(2000), allowNull: false },
      internal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'support_messages' },
  );

  return SupportMessage;
};
