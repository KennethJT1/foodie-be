const { TABLE_OPTIONS, id, timestamps } = require('../migrationHelpers.cjs');

// user_id gets its FK to users in the phase 6 migration that creates users
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'notifications',
      {
        ...id(Sequelize),
        user_id: { type: Sequelize.STRING(64), allowNull: false },
        type: {
          type: Sequelize.ENUM('order', 'refund', 'social', 'review', 'subscription', 'payout', 'system'),
          allowNull: false,
        },
        title: { type: Sequelize.STRING(160), allowNull: false },
        body: { type: Sequelize.STRING(500), allowNull: false },
        link: { type: Sequelize.STRING(255), allowNull: true },
        data: { type: Sequelize.JSON, allowNull: true },
        read_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    // The bell: a user's unread count and newest-first list
    await queryInterface.addIndex('notifications', ['user_id', 'read_at', 'created_at'], {
      name: 'notifications_user_read_created',
    });
    await queryInterface.addIndex('notifications', ['user_id', 'created_at'], { name: 'notifications_user_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
