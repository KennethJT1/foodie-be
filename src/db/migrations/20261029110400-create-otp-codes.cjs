const { TABLE_OPTIONS, id, timestamps } = require('../migrationHelpers.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'otp_codes',
      {
        ...id(Sequelize),
        // E.164 phone, or an email for password resets by email
        identifier: { type: Sequelize.STRING(191), allowNull: false },
        purpose: { type: Sequelize.ENUM('login', 'verify', 'reset'), allowNull: false },
        code_hash: { type: Sequelize.CHAR(64), allowNull: false },
        attempts: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        expires_at: { type: Sequelize.DATE(3), allowNull: false },
        consumed_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('otp_codes', ['identifier', 'purpose', 'created_at'], { name: 'otp_codes_lookup' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('otp_codes');
  },
};
