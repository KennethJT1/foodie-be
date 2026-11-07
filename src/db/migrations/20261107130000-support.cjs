const { TABLE_OPTIONS, foreignId, id, timestamps } = require('../migrationHelpers.cjs');

// Phase 20: help tickets from customers, vendors and riders, and the admin inbox. Internal notes
// are messages with `internal` set; they never reach the ticket's owner.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'support_tickets',
      {
        ...id(Sequelize),
        // #1000, #1001… people quote it
        number: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, unique: true },
        user_id: foreignId(Sequelize, 'users'),
        user_name: { type: Sequelize.STRING(121), allowNull: false },
        user_role: { type: Sequelize.ENUM('customer', 'vendor', 'rider'), allowNull: false },
        order_id: foreignId(Sequelize, 'orders', { allowNull: true, onDelete: 'SET NULL' }),
        order_code: { type: Sequelize.CHAR(6), allowNull: true },
        subject: { type: Sequelize.STRING(120), allowNull: false },
        status: {
          type: Sequelize.ENUM('open', 'pending', 'resolved', 'closed'),
          allowNull: false,
          defaultValue: 'open',
        },
        priority: { type: Sequelize.ENUM('low', 'normal', 'high'), allowNull: false, defaultValue: 'normal' },
        assignee_id: foreignId(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
        // List previews, kept in step with the messages
        last_message: { type: Sequelize.STRING(2000), allowNull: false, defaultValue: '' },
        has_reply: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        message_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('support_tickets', ['user_id', 'updated_at'], { name: 'support_tickets_user' });
    await queryInterface.addIndex('support_tickets', ['status', 'updated_at'], { name: 'support_tickets_status' });
    await queryInterface.addIndex('support_tickets', ['assignee_id', 'status'], { name: 'support_tickets_assignee' });

    await queryInterface.createTable(
      'support_messages',
      {
        ...id(Sequelize),
        ticket_id: foreignId(Sequelize, 'support_tickets', { onDelete: 'CASCADE' }),
        author_id: foreignId(Sequelize, 'users'),
        author_name: { type: Sequelize.STRING(121), allowNull: false },
        author_role: { type: Sequelize.ENUM('customer', 'vendor', 'rider', 'admin'), allowNull: false },
        body: { type: Sequelize.STRING(2000), allowNull: false },
        internal: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('support_messages', ['ticket_id', 'created_at'], { name: 'support_messages_ticket' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('support_messages');
    await queryInterface.dropTable('support_tickets');
  },
};
