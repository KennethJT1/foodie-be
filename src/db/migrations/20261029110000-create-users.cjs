const { id, timestamps, softDelete } = require('../migrationHelpers.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      ...id(Sequelize),
      role: { type: Sequelize.ENUM('customer', 'vendor', 'rider', 'admin'), allowNull: false },
      // Admin sub-role slug; the roles table and its FK arrive in phase 7
      admin_role: { type: Sequelize.STRING(32), allowNull: true },
      first_name: { type: Sequelize.STRING(60), allowNull: false },
      last_name: { type: Sequelize.STRING(60), allowNull: false },
      email: { type: Sequelize.STRING(191), allowNull: true, unique: true },
      // E.164; null for Google-only and deleted accounts
      phone: { type: Sequelize.STRING(20), allowNull: true, unique: true },
      // Null for Google-only accounts
      password_hash: { type: Sequelize.STRING(255), allowNull: true },
      google_id: { type: Sequelize.STRING(64), allowNull: true, unique: true },
      avatar_url: { type: Sequelize.STRING(500), allowNull: true },
      status: { type: Sequelize.ENUM('active', 'suspended', 'banned'), allowNull: false, defaultValue: 'active' },
      phone_verified_at: { type: Sequelize.DATE(3), allowNull: true },
      email_verified_at: { type: Sequelize.DATE(3), allowNull: true },
      last_login_at: { type: Sequelize.DATE(3), allowNull: true },
      ...timestamps(Sequelize),
      ...softDelete(Sequelize),
    });
    await queryInterface.addIndex('users', ['role', 'status', 'created_at'], { name: 'users_role_status_created' });

    // notifications was created before users (phase 5)
    await queryInterface.addConstraint('notifications', {
      type: 'foreign key',
      name: 'notifications_user_id_fk',
      fields: ['user_id'],
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('notifications', 'notifications_user_id_fk');
    await queryInterface.dropTable('users');
  },
};
