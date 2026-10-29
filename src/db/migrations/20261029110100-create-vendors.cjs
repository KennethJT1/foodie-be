const { id, foreignId, timestamps, softDelete } = require('../migrationHelpers.cjs');

// Only what sign-up and /me need; phase 10 (onboarding) and 12 (subscriptions) add the rest
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vendors', {
      ...id(Sequelize),
      owner_user_id: { ...foreignId(Sequelize, 'users'), unique: true },
      name: { type: Sequelize.STRING(120), allowNull: false, defaultValue: '' },
      // Set from the store name during onboarding
      slug: { type: Sequelize.STRING(120), allowNull: true, unique: true },
      type: { type: Sequelize.ENUM('restaurant', 'home_cook'), allowNull: true },
      logo_url: { type: Sequelize.STRING(500), allowNull: true },
      approval_status: {
        type: Sequelize.ENUM('draft', 'pending', 'approved', 'rejected', 'suspended'),
        allowNull: false,
        defaultValue: 'draft',
      },
      onboarding_step: {
        type: Sequelize.ENUM('type', 'business', 'location', 'documents', 'bank', 'review', 'submitted'),
        allowNull: false,
        defaultValue: 'type',
      },
      subscription_status: {
        type: Sequelize.ENUM('none', 'trial', 'active', 'grace', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'none',
      },
      // FK to plans arrives with the plans table (phase 12)
      plan_id: { type: Sequelize.STRING(64), allowNull: true },
      trial_used: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(Sequelize),
      ...softDelete(Sequelize),
    });
    await queryInterface.addIndex('vendors', ['approval_status', 'subscription_status'], {
      name: 'vendors_visibility',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vendors');
  },
};
