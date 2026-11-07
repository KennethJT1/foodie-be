import { idColumn } from '../id.js';

export const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'];
export const TICKET_PRIORITIES = ['low', 'normal', 'high'];

export default (sequelize, DataTypes) => {
  const SupportTicket = sequelize.define(
    'SupportTicket',
    {
      id: idColumn(),
      number: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      userName: { type: DataTypes.STRING(121), allowNull: false },
      userRole: { type: DataTypes.ENUM('customer', 'vendor', 'rider'), allowNull: false },
      orderId: { type: DataTypes.UUID, allowNull: true },
      orderCode: { type: DataTypes.CHAR(6), allowNull: true },
      subject: { type: DataTypes.STRING(120), allowNull: false },
      status: { type: DataTypes.ENUM(...TICKET_STATUSES), allowNull: false, defaultValue: 'open' },
      priority: { type: DataTypes.ENUM(...TICKET_PRIORITIES), allowNull: false, defaultValue: 'normal' },
      assigneeId: { type: DataTypes.UUID, allowNull: true },
      lastMessage: { type: DataTypes.STRING(2000), allowNull: false, defaultValue: '' },
      hasReply: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      messageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'support_tickets' },
  );

  return SupportTicket;
};
