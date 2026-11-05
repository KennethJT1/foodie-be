const { TABLE_OPTIONS, foreignId, id, timestamps } = require('../migrationHelpers.cjs');

// Phase 14: likes, follows, comments (one level of vendor replies) and moderation reports
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'likes',
      {
        ...id(Sequelize),
        user_id: foreignId(Sequelize, 'users', { onDelete: 'CASCADE' }),
        food_item_id: foreignId(Sequelize, 'food_items', { onDelete: 'CASCADE' }),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('likes', ['user_id', 'food_item_id'], { name: 'likes_user_item', unique: true });
    await queryInterface.addIndex('likes', ['food_item_id'], { name: 'likes_item' });

    await queryInterface.createTable(
      'follows',
      {
        ...id(Sequelize),
        user_id: foreignId(Sequelize, 'users', { onDelete: 'CASCADE' }),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('follows', ['user_id', 'vendor_id'], { name: 'follows_user_vendor', unique: true });
    await queryInterface.addIndex('follows', ['vendor_id', 'created_at'], { name: 'follows_vendor_created' });

    await queryInterface.createTable(
      'comments',
      {
        ...id(Sequelize),
        food_item_id: foreignId(Sequelize, 'food_items', { onDelete: 'CASCADE' }),
        user_id: foreignId(Sequelize, 'users'),
        // Vendor replies point at a top-level comment; customers only write top-level comments
        parent_id: foreignId(Sequelize, 'comments', { allowNull: true, onDelete: 'CASCADE' }),
        is_vendor_reply: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        body: { type: Sequelize.STRING(500), allowNull: false },
        edited_at: { type: Sequelize.DATE(3), allowNull: true },
        // Deleted by the author, or removed / hidden by moderation: shown as "Comment removed"
        removed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        hidden: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('comments', ['food_item_id', 'parent_id', 'created_at'], {
      name: 'comments_item_thread',
    });

    await queryInterface.createTable(
      'reports',
      {
        ...id(Sequelize),
        reporter_id: foreignId(Sequelize, 'users', { onDelete: 'CASCADE' }),
        target_type: { type: Sequelize.ENUM('comment', 'food_item'), allowNull: false },
        // A comment or food item id (no FK: the target type decides the table)
        target_id: { type: Sequelize.STRING(64), allowNull: false },
        reason: { type: Sequelize.STRING(200), allowNull: false },
        status: { type: Sequelize.ENUM('open', 'resolved', 'dismissed'), allowNull: false, defaultValue: 'open' },
        action: { type: Sequelize.ENUM('hide', 'remove', 'dismiss'), allowNull: true },
        resolved_by: foreignId(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
        resolved_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('reports', ['target_type', 'target_id', 'status'], { name: 'reports_target_status' });
    await queryInterface.addIndex('reports', ['status', 'created_at'], { name: 'reports_status_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reports');
    await queryInterface.dropTable('comments');
    await queryInterface.dropTable('follows');
    await queryInterface.dropTable('likes');
  },
};
