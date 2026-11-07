const { TABLE_OPTIONS, foreignId, id, kobo, timestamps } = require('../migrationHelpers.cjs');

// Phase 17: deliveries (one per order that got a rider), the job offers dispatch sends riders, and
// the customer–rider chat
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'deliveries',
      {
        ...id(Sequelize),
        order_id: { ...foreignId(Sequelize, 'orders', { onDelete: 'CASCADE' }), unique: true },
        // The rider doing it now (admin reassignment changes it before pickup)
        rider_id: foreignId(Sequelize, 'riders'),
        status: {
          type: Sequelize.ENUM('assigned', 'picked_up', 'delivered', 'cancelled'),
          allowNull: false,
          defaultValue: 'assigned',
        },
        fee: kobo(Sequelize),
        // riderPayoutPct when the rider took the job; the earning is fixed at delivery
        payout_pct: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false },
        rider_earning: kobo(Sequelize),
        distance_m: { type: Sequelize.INTEGER, allowNull: false },
        // { name, phone, address, lat, lng } and { name, phone, address, note, lat, lng }
        pickup: { type: Sequelize.JSON, allowNull: false },
        dropoff: { type: Sequelize.JSON, allowNull: false },
        // [{ lat, lng, at }] from rider:location while the delivery is moving (FR-GPS-05)
        route: { type: Sequelize.JSON, allowNull: false },
        assigned_at: { type: Sequelize.DATE(3), allowNull: false },
        picked_up_at: { type: Sequelize.DATE(3), allowNull: true },
        delivered_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('deliveries', ['rider_id', 'status'], { name: 'deliveries_rider_status' });
    await queryInterface.addIndex('deliveries', ['rider_id', 'delivered_at'], { name: 'deliveries_rider_delivered' });

    await queryInterface.createTable(
      'delivery_offers',
      {
        ...id(Sequelize),
        order_id: foreignId(Sequelize, 'orders', { onDelete: 'CASCADE' }),
        rider_id: foreignId(Sequelize, 'riders', { onDelete: 'CASCADE' }),
        status: {
          type: Sequelize.ENUM('pending', 'accepted', 'declined', 'expired'),
          allowNull: false,
          defaultValue: 'pending',
        },
        fee: kobo(Sequelize),
        earning: kobo(Sequelize),
        distance_m: { type: Sequelize.INTEGER, allowNull: false },
        to_pickup_m: { type: Sequelize.INTEGER, allowNull: true },
        // { name, area, lat, lng } and { area, city, lat, lng }
        pickup: { type: Sequelize.JSON, allowNull: false },
        dropoff: { type: Sequelize.JSON, allowNull: false },
        expires_at: { type: Sequelize.DATE(3), allowNull: false },
        responded_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('delivery_offers', ['rider_id', 'status'], { name: 'delivery_offers_rider_status' });
    await queryInterface.addIndex('delivery_offers', ['order_id', 'status'], { name: 'delivery_offers_order_status' });

    await queryInterface.createTable(
      'chat_messages',
      {
        ...id(Sequelize),
        order_id: foreignId(Sequelize, 'orders', { onDelete: 'CASCADE' }),
        sender_id: foreignId(Sequelize, 'users'),
        sender_role: { type: Sequelize.ENUM('customer', 'rider'), allowNull: false },
        sender_name: { type: Sequelize.STRING(121), allowNull: false },
        body: { type: Sequelize.STRING(500), allowNull: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('chat_messages', ['order_id', 'created_at'], { name: 'chat_messages_order' });

    // Dispatch admins are told once per order when no rider takes it
    await queryInterface.addColumn('orders', 'dispatch_alerted_at', { type: Sequelize.DATE(3), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'dispatch_alerted_at');
    await queryInterface.dropTable('chat_messages');
    await queryInterface.dropTable('delivery_offers');
    await queryInterface.dropTable('deliveries');
  },
};
