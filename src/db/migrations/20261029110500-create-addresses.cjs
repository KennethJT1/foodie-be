const { id, foreignId, timestamps } = require('../migrationHelpers.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('addresses', {
      ...id(Sequelize),
      user_id: foreignId(Sequelize, 'users', { onDelete: 'CASCADE' }),
      label: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'Home' },
      line1: { type: Sequelize.STRING(200), allowNull: false },
      area: { type: Sequelize.STRING(100), allowNull: false },
      city: { type: Sequelize.STRING(100), allowNull: false },
      state: { type: Sequelize.STRING(100), allowNull: false, defaultValue: '' },
      lat: { type: Sequelize.DECIMAL(10, 7), allowNull: false },
      lng: { type: Sequelize.DECIMAL(10, 7), allowNull: false },
      directions: { type: Sequelize.STRING(300), allowNull: true },
      is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('addresses', ['user_id', 'is_default'], { name: 'addresses_user_default' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('addresses');
  },
};
