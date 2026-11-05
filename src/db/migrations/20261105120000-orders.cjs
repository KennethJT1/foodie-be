const { TABLE_OPTIONS, foreignId, id, kobo, timestamps } = require('../migrationHelpers.cjs');

// Phase 15: orders (created by payment verification only) and their lines; order payments join
// the payments table from phase 12
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'orders',
      {
        ...id(Sequelize),
        // 6 characters people read aloud; the UI prints KJT-<code>
        code: { type: Sequelize.CHAR(6), allowNull: false, unique: true },
        customer_id: foreignId(Sequelize, 'users'),
        vendor_id: foreignId(Sequelize, 'vendors'),
        rider_id: foreignId(Sequelize, 'riders', { allowNull: true, onDelete: 'SET NULL' }),
        status: {
          type: Sequelize.ENUM(
            'paid',
            'accepted',
            'rejected',
            'preparing',
            'ready_for_pickup',
            'rider_assigned',
            'picked_up',
            'delivered',
            'cancelled',
          ),
          allowNull: false,
          defaultValue: 'paid',
        },
        // Snapshots: what the order was placed with, whatever changes later
        customer_name: { type: Sequelize.STRING(121), allowNull: false },
        customer_phone: { type: Sequelize.STRING(20), allowNull: true },
        vendor_name: { type: Sequelize.STRING(120), allowNull: false },
        vendor_slug: { type: Sequelize.STRING(120), allowNull: true },
        subtotal: kobo(Sequelize),
        delivery_fee: kobo(Sequelize),
        processing_fee: kobo(Sequelize),
        total: kobo(Sequelize),
        // { label, line1, area, city, state, lat, lng }
        address: { type: Sequelize.JSON, allowNull: false },
        delivery_note: { type: Sequelize.STRING(200), allowNull: false, defaultValue: '' },
        scheduled_for: { type: Sequelize.DATE(3), allowNull: true },
        // 4 digits the customer gives the rider (shown to the customer and admins only)
        delivery_code: { type: Sequelize.CHAR(4), allowNull: false },
        distance_m: { type: Sequelize.INTEGER, allowNull: false },
        eta_min_mins: { type: Sequelize.SMALLINT, allowNull: false },
        eta_max_mins: { type: Sequelize.SMALLINT, allowNull: false },
        accept_deadline: { type: Sequelize.DATE(3), allowNull: false },
        // [{ status, at, by: system | customer | vendor | rider | admin, note? }]
        status_history: { type: Sequelize.JSON, allowNull: false },
        cancel_reason: { type: Sequelize.STRING(200), allowNull: true },
        rated_vendor: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        rated_rider: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        payment_reference: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('orders', ['vendor_id', 'status', 'created_at'], { name: 'orders_vendor_status' });
    await queryInterface.addIndex('orders', ['customer_id', 'created_at'], { name: 'orders_customer' });
    await queryInterface.addIndex('orders', ['rider_id', 'status'], { name: 'orders_rider_status' });
    await queryInterface.addIndex('orders', ['status', 'accept_deadline'], { name: 'orders_status_deadline' });
    await queryInterface.addIndex('orders', ['created_at'], { name: 'orders_created' });

    await queryInterface.createTable(
      'order_items',
      {
        ...id(Sequelize),
        order_id: foreignId(Sequelize, 'orders', { onDelete: 'CASCADE' }),
        // No FK: menu items can be deleted; the line keeps its own copy
        food_item_id: { type: Sequelize.CHAR(36), allowNull: false },
        name: { type: Sequelize.STRING(80), allowNull: false },
        unit_price: kobo(Sequelize),
        quantity: { type: Sequelize.SMALLINT, allowNull: false },
        // [{ groupId, groupName, optionId, name, price }]
        options: { type: Sequelize.JSON, allowNull: false },
        line_total: kobo(Sequelize),
        sort_order: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('order_items', ['order_id'], { name: 'order_items_order' });
    await queryInterface.addIndex('order_items', ['food_item_id'], { name: 'order_items_food_item' });

    await queryInterface.addConstraint('payments', {
      fields: ['order_id'],
      type: 'foreign key',
      name: 'payments_order_id_fk',
      references: { table: 'orders', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('payments', 'settled_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn('payments', 'refunded_at', { type: Sequelize.DATE(3), allowNull: true });
    await queryInterface.addColumn('payments', 'reconcile_note', { type: Sequelize.STRING(500), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('payments', 'reconcile_note');
    await queryInterface.removeColumn('payments', 'refunded_at');
    await queryInterface.removeColumn('payments', 'settled_at');
    await queryInterface.removeConstraint('payments', 'payments_order_id_fk');
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
  },
};
