const { TABLE_OPTIONS, foreignId, id, kobo, timestamps, uuid } = require('../migrationHelpers.cjs');

// Phase 18: ratings of vendors and riders after delivery, and riders' monthly payout statements
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'reviews',
      {
        ...id(Sequelize),
        order_id: foreignId(Sequelize, 'orders', { onDelete: 'CASCADE' }),
        target_type: { type: Sequelize.ENUM('vendor', 'rider'), allowNull: false },
        // vendors.id or riders.id, by target_type
        target_id: { type: uuid(Sequelize), allowNull: false },
        user_id: foreignId(Sequelize, 'users'),
        // The reviewer's name when they wrote it
        user_name: { type: Sequelize.STRING(121), allowNull: false },
        rating: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false },
        comment: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
        // The vendor's one reply
        reply: { type: Sequelize.STRING(500), allowNull: true },
        replied_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    // Once per target per order
    await queryInterface.addIndex('reviews', ['order_id', 'target_type'], {
      unique: true,
      name: 'reviews_order_target',
    });
    await queryInterface.addIndex('reviews', ['target_type', 'target_id', 'created_at'], { name: 'reviews_target' });

    await queryInterface.createTable(
      'rider_payout_statements',
      {
        ...id(Sequelize),
        rider_id: foreignId(Sequelize, 'riders'),
        // Lagos calendar month, YYYY-MM
        month: { type: Sequelize.CHAR(7), allowNull: false },
        trips: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        delivery_fees: kobo(Sequelize),
        payout_pct: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false },
        amount: kobo(Sequelize),
        adjustments: kobo(Sequelize),
        status: { type: Sequelize.ENUM('draft', 'approved', 'paid'), allowNull: false, defaultValue: 'draft' },
        // Bank transfer reference
        reference: { type: Sequelize.STRING(60), allowNull: true },
        approved_at: { type: Sequelize.DATE(3), allowNull: true },
        approved_by: foreignId(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
        paid_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    // The monthly job may run twice; a rider has one statement per month
    await queryInterface.addIndex('rider_payout_statements', ['rider_id', 'month'], {
      unique: true,
      name: 'rider_payout_statements_rider_month',
    });
    await queryInterface.addIndex('rider_payout_statements', ['month', 'status'], {
      name: 'rider_payout_statements_month_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rider_payout_statements');
    await queryInterface.dropTable('reviews');
  },
};
