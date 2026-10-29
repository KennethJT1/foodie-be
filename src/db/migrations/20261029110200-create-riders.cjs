const { id, foreignId, timestamps } = require('../migrationHelpers.cjs');

// Only what sign-up and /me need; phase 11 (onboarding) and 17 (dispatch) add the rest
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('riders', {
      ...id(Sequelize),
      user_id: { ...foreignId(Sequelize, 'users'), unique: true },
      approval_status: {
        type: Sequelize.ENUM('draft', 'pending', 'approved', 'rejected', 'suspended'),
        allowNull: false,
        defaultValue: 'draft',
      },
      is_online: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(Sequelize),
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('riders');
  },
};
