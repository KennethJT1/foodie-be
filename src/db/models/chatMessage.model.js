import { idColumn } from '../id.js';

export default (sequelize, DataTypes) => {
  const ChatMessage = sequelize.define(
    'ChatMessage',
    {
      id: idColumn(),
      orderId: { type: DataTypes.UUID, allowNull: false },
      senderId: { type: DataTypes.UUID, allowNull: false },
      senderRole: { type: DataTypes.ENUM('customer', 'rider'), allowNull: false },
      senderName: { type: DataTypes.STRING(121), allowNull: false },
      body: { type: DataTypes.STRING(500), allowNull: false },
    },
    { tableName: 'chat_messages' },
  );

  return ChatMessage;
};
