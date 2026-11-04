const { TABLE_OPTIONS, foreignId, id, kobo, softDelete, timestamps } = require('../migrationHelpers.cjs');

// Phase 13: categories, food items (the vendor's menu) and vendor staff
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'categories',
      {
        ...id(Sequelize),
        name: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        slug: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        icon: { type: Sequelize.STRING(16), allowNull: true },
        // A real photo: the first photo of the category's first seeded dish
        image_url: { type: Sequelize.STRING(500), allowNull: true },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      'food_items',
      {
        ...id(Sequelize),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        category_id: foreignId(Sequelize, 'categories'),
        name: { type: Sequelize.STRING(80), allowNull: false },
        slug: { type: Sequelize.STRING(90), allowNull: false },
        description: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
        price: kobo(Sequelize),
        // Ordered photo URLs and, for seeded photos, their credits ({ url, author, license, source })
        photos: { type: Sequelize.JSON, allowNull: false },
        photo_credits: { type: Sequelize.JSON, allowNull: true },
        portion: { type: Sequelize.STRING(60), allowNull: false, defaultValue: '' },
        prep_time_mins: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 20 },
        // Sold out stays visible; hidden (moderation) and deleted never are
        is_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        available_days: { type: Sequelize.JSON, allowNull: false },
        available_from: { type: Sequelize.CHAR(5), allowNull: true },
        available_to: { type: Sequelize.CHAR(5), allowNull: true },
        // [{ id, name, required, max, options: [{ id, name, price }] }]; orders copy what was chosen
        option_groups: { type: Sequelize.JSON, allowNull: false },
        likes_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        comments_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        orders_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        is_hidden: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        hidden_reason: { type: Sequelize.STRING(300), allowNull: true },
        ...timestamps(Sequelize),
        ...softDelete(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('food_items', ['vendor_id', 'deleted_at'], { name: 'food_items_vendor' });
    await queryInterface.addIndex('food_items', ['category_id'], { name: 'food_items_category' });
    await queryInterface.addIndex('food_items', ['likes_count'], { name: 'food_items_likes' });
    await queryInterface.addIndex('food_items', ['created_at'], { name: 'food_items_created' });

    // Staff the owner invited (manager or kitchen), counted against the plan's staff limit
    await queryInterface.createTable(
      'vendor_staff',
      {
        ...id(Sequelize),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        name: { type: Sequelize.STRING(120), allowNull: false },
        email: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        phone: { type: Sequelize.STRING(20), allowNull: true },
        role: { type: Sequelize.ENUM('manager', 'kitchen'), allowNull: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('vendor_staff', ['vendor_id'], { name: 'vendor_staff_vendor' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vendor_staff');
    await queryInterface.dropTable('food_items');
    await queryInterface.dropTable('categories');
  },
};
