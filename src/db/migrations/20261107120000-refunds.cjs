const { TABLE_OPTIONS, foreignId, id, kobo, timestamps } = require('../migrationHelpers.cjs');

// Phase 19: refund requests on delivered orders (BR-REF). The vendor answers before `deadline`;
// every step goes on `timeline`; admins add internal `comments` and may escalate.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'refunds',
      {
        ...id(Sequelize),
        // One request per order
        order_id: { ...foreignId(Sequelize, 'orders', { onDelete: 'CASCADE' }), unique: true },
        customer_id: foreignId(Sequelize, 'users'),
        vendor_id: foreignId(Sequelize, 'vendors'),
        // Snapshots for lists and search
        order_code: { type: Sequelize.CHAR(6), allowNull: false },
        customer_name: { type: Sequelize.STRING(121), allowNull: false },
        vendor_name: { type: Sequelize.STRING(120), allowNull: false },
        reason: { type: Sequelize.STRING(100), allowNull: false },
        details: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
        // Asked for, then what the vendor agreed (up to the food subtotal)
        amount: kobo(Sequelize),
        order_subtotal: kobo(Sequelize),
        photos: { type: Sequelize.JSON, allowNull: false },
        status: {
          type: Sequelize.ENUM('requested', 'accepted', 'rejected', 'paid', 'confirmed', 'disputed', 'escalated'),
          allowNull: false,
          defaultValue: 'requested',
        },
        deadline: { type: Sequelize.DATE(3), allowNull: false },
        // { decision, amount, reason, at }
        vendor_response: { type: Sequelize.JSON, allowNull: true },
        payment_reference: { type: Sequelize.STRING(60), allowNull: true },
        escalated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        // [{ status, at, by: system | customer | vendor | admin, note }]
        timeline: { type: Sequelize.JSON, allowNull: false },
        // Internal: [{ id, authorId, authorName, body, createdAt }]
        comments: { type: Sequelize.JSON, allowNull: false },
        // When the missed-deadline action ran (once)
        deadline_handled_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('refunds', ['vendor_id', 'status', 'created_at'], { name: 'refunds_vendor_status' });
    await queryInterface.addIndex('refunds', ['customer_id', 'created_at'], { name: 'refunds_customer' });
    await queryInterface.addIndex('refunds', ['status', 'deadline'], { name: 'refunds_status_deadline' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refunds');
  },
};
