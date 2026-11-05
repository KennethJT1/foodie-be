const { TABLE_OPTIONS, foreignId, id, timestamps } = require('../migrationHelpers.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'refresh_tokens',
      {
        ...id(Sequelize),
        user_id: foreignId(Sequelize, 'users', { onDelete: 'CASCADE' }),
        // SHA-256 of the cookie value; the raw token is never stored
        token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
        // Every rotation of one sign-in shares a family; reusing an old token revokes the family
        family_id: { type: Sequelize.CHAR(36), allowNull: false },
        expires_at: { type: Sequelize.DATE(3), allowNull: false },
        revoked_at: { type: Sequelize.DATE(3), allowNull: true },
        revoked_reason: {
          type: Sequelize.ENUM('rotated', 'logout', 'reuse', 'password_reset', 'deleted'),
          allowNull: true,
        },
        ip: { type: Sequelize.STRING(45), allowNull: true },
        user_agent: { type: Sequelize.STRING(255), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('refresh_tokens', ['family_id'], { name: 'refresh_tokens_family' });
    await queryInterface.addIndex('refresh_tokens', ['user_id', 'revoked_at'], { name: 'refresh_tokens_user_active' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
