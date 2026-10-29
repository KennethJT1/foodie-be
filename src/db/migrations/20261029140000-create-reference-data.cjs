const { TABLE_OPTIONS, id, timestamps } = require('../migrationHelpers.cjs');

// Platform settings and reference data (handoff 8.3). Rows come from the seeder; the app falls back
// to the defaults in code for any setting key that has no row.
module.exports = {
  async up(queryInterface, Sequelize) {
    // One row per setting key (fees, payout %, timeouts…); value is JSON so a key keeps its type
    await queryInterface.createTable(
      'settings',
      {
        key: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
        value: { type: Sequelize.JSON, allowNull: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.createTable(
      'service_areas',
      {
        ...id(Sequelize),
        // City name as shown to users and stored on addresses / vendors
        name: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        state: { type: Sequelize.STRING(60), allowNull: true },
        // City centre for maps; null for a city an admin added without coordinates
        lat: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
        lng: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
        // Neighbourhoods offered in address and vendor forms
        areas: { type: Sequelize.JSON, allowNull: true },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // Removed cities are kept (old addresses point at them) but no longer offered
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.createTable(
      'notification_templates',
      {
        key: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
        channel: { type: Sequelize.ENUM('email', 'sms', 'inapp'), allowNull: false },
        subject: { type: Sequelize.STRING(120), allowNull: false, defaultValue: '' },
        body: { type: Sequelize.STRING(1000), allowNull: false },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.createTable(
      'required_documents',
      {
        ...id(Sequelize),
        applies_to: { type: Sequelize.ENUM('restaurant', 'home_cook', 'rider'), allowNull: false },
        type: { type: Sequelize.STRING(40), allowNull: false },
        label: { type: Sequelize.STRING(120), allowNull: false },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('required_documents', ['applies_to', 'type'], {
      name: 'required_documents_applies_type',
      unique: true,
    });
    // Settlement banks: Paystack's list in production (refreshed daily), the seeded list elsewhere
    await queryInterface.createTable(
      'banks',
      {
        code: { type: Sequelize.STRING(20), primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(120), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('banks');
    await queryInterface.dropTable('required_documents');
    await queryInterface.dropTable('notification_templates');
    await queryInterface.dropTable('service_areas');
    await queryInterface.dropTable('settings');
  },
};
