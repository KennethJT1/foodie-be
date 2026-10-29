const { TABLE_OPTIONS, foreignId, id, timestamps } = require('../migrationHelpers.cjs');

// Every file stored by POST /uploads. Later endpoints receive the returned url and look it up here,
// so a user can only attach their own files, and private documents can be re-signed on read.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'uploads',
      {
        ...id(Sequelize),
        user_id: foreignId(Sequelize, 'users', { onDelete: 'CASCADE' }),
        purpose: {
          type: Sequelize.ENUM(
            'food_photo',
            'vendor_logo',
            'vendor_cover',
            'vendor_document',
            'rider_document',
            'refund_photo',
            'avatar',
          ),
          allowNull: false,
        },
        public_id: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        // image or raw (PDF); private files are only reachable through signed URLs
        resource_type: { type: Sequelize.ENUM('image', 'raw'), allowNull: false },
        is_private: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        format: { type: Sequelize.STRING(8), allowNull: false },
        // The URL returned to the client (signed for private files); unique so it identifies the upload
        url: { type: Sequelize.STRING(768), allowNull: false },
        width: { type: Sequelize.INTEGER, allowNull: true },
        height: { type: Sequelize.INTEGER, allowNull: true },
        bytes: { type: Sequelize.INTEGER, allowNull: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('uploads', ['url'], { name: 'uploads_url', unique: true });
    await queryInterface.addIndex('uploads', ['user_id', 'created_at'], { name: 'uploads_user_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('uploads');
  },
};
