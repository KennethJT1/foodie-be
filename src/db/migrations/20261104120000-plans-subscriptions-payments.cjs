const { TABLE_OPTIONS, foreignId, id, kobo, timestamps } = require('../migrationHelpers.cjs');

// Phase 12: plans, vendor subscriptions and their invoices, payments (subscription now, orders in
// phase 15) and Paystack webhook events
module.exports = {
  async up(queryInterface, Sequelize) {
    // Yearly prices are not stored: 12 × monthly minus the yearlyDiscountPct setting
    await queryInterface.createTable(
      'plans',
      {
        ...id(Sequelize),
        name: { type: Sequelize.STRING(40), allowNull: false, unique: true },
        monthly_price: kobo(Sequelize),
        // null = unlimited
        menu_items_limit: { type: Sequelize.INTEGER, allowNull: true },
        photos_per_item: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        staff_limit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        featured: { type: Sequelize.ENUM('none', 'occasional', 'priority'), allowNull: false, defaultValue: 'none' },
        analytics: { type: Sequelize.ENUM('basic', 'full', 'export'), allowNull: false, defaultValue: 'basic' },
        is_popular: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        // Retired plans are no longer sold; vendors on them keep them until they change
        is_retired: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    // Earlier seeds stored plan ids before the plans table existed; reseed to get them back
    await queryInterface.sequelize.query('UPDATE vendors SET plan_id = NULL WHERE plan_id IS NOT NULL');
    await queryInterface.addConstraint('vendors', {
      fields: ['plan_id'],
      type: 'foreign key',
      name: 'vendors_plan_id_fk',
      references: { table: 'plans', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    // One row per vendor, reused across trial, renewals and plan changes
    await queryInterface.createTable(
      'subscriptions',
      {
        ...id(Sequelize),
        vendor_id: { ...foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }), unique: true },
        plan_id: foreignId(Sequelize, 'plans'),
        interval: { type: Sequelize.ENUM('monthly', 'yearly'), allowNull: false, defaultValue: 'monthly' },
        // Mirrors vendors.subscription_status (which public reads filter on)
        status: { type: Sequelize.ENUM('trial', 'active', 'grace', 'expired'), allowNull: false },
        current_period_start: { type: Sequelize.DATE(3), allowNull: false },
        current_period_end: { type: Sequelize.DATE(3), allowNull: false },
        trial_ends_at: { type: Sequelize.DATE(3), allowNull: true },
        grace_ends_at: { type: Sequelize.DATE(3), allowNull: true },
        cancel_at_period_end: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        // Downgrade waiting for the next renewal (BR-SUB-03)
        scheduled_plan_id: foreignId(Sequelize, 'plans', { allowNull: true, onDelete: 'SET NULL' }),
        scheduled_interval: { type: Sequelize.ENUM('monthly', 'yearly'), allowNull: true },
        // Reusable card from the last payment; renewals charge it
        paystack_authorization_code: { type: Sequelize.STRING(64), allowNull: true },
        paystack_email: { type: Sequelize.STRING(191), allowNull: true },
        // Reminders already sent for the current period (cleared when the period changes)
        reminded_7d_at: { type: Sequelize.DATE(3), allowNull: true },
        reminded_1d_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('subscriptions', ['status', 'current_period_end'], {
      name: 'subscriptions_status_period_end',
    });

    await queryInterface.createTable(
      'subscription_invoices',
      {
        ...id(Sequelize),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        subscription_id: foreignId(Sequelize, 'subscriptions', { onDelete: 'CASCADE' }),
        plan_id: foreignId(Sequelize, 'plans'),
        interval: { type: Sequelize.ENUM('monthly', 'yearly'), allowNull: false },
        amount: kobo(Sequelize),
        status: { type: Sequelize.ENUM('paid', 'failed'), allowNull: false },
        reference: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        period_start: { type: Sequelize.DATE(3), allowNull: true },
        period_end: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('subscription_invoices', ['vendor_id', 'created_at'], {
      name: 'subscription_invoices_vendor_created',
    });

    // Every Paystack transaction: plan payments now, order payments from phase 15
    await queryInterface.createTable(
      'payments',
      {
        ...id(Sequelize),
        reference: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        type: { type: Sequelize.ENUM('order', 'subscription'), allowNull: false },
        // Who paid
        user_id: foreignId(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
        vendor_id: foreignId(Sequelize, 'vendors', { allowNull: true, onDelete: 'SET NULL' }),
        // FK added with the orders table (phase 15)
        order_id: { type: Sequelize.STRING(64), allowNull: true },
        amount: kobo(Sequelize),
        vendor_share: kobo(Sequelize),
        platform_share: kobo(Sequelize),
        // Paystack's fee
        fee: kobo(Sequelize),
        channel: { type: Sequelize.STRING(20), allowNull: true },
        status: {
          type: Sequelize.ENUM('pending', 'success', 'failed', 'abandoned', 'refunded'),
          allowNull: false,
          defaultValue: 'pending',
        },
        settlement_status: { type: Sequelize.ENUM('settling', 'settled', 'refunded'), allowNull: true },
        // Reconciliation (BR-PAY-08): amount_mismatch, missing_webhook...
        flag: { type: Sequelize.STRING(40), allowNull: true },
        reconciled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        access_code: { type: Sequelize.STRING(64), allowNull: true },
        // What the payment is for (plan choice, cart snapshot) so verify can finish the job
        metadata: { type: Sequelize.JSON, allowNull: true },
        paid_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('payments', ['type', 'status', 'created_at'], {
      name: 'payments_type_status_created',
    });
    await queryInterface.addIndex('payments', ['vendor_id', 'created_at'], { name: 'payments_vendor_created' });

    // Webhook deliveries, one row per Paystack event (the unique id ignores retries)
    await queryInterface.createTable(
      'payment_events',
      {
        ...id(Sequelize),
        provider: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'paystack' },
        event_id: { type: Sequelize.STRING(128), allowNull: false, unique: true },
        event_type: { type: Sequelize.STRING(60), allowNull: false },
        reference: { type: Sequelize.STRING(64), allowNull: true },
        payload: { type: Sequelize.JSON, allowNull: false },
        processed_at: { type: Sequelize.DATE(3), allowNull: true },
        error: { type: Sequelize.STRING(500), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('payment_events', ['reference'], { name: 'payment_events_reference' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_events');
    await queryInterface.dropTable('payments');
    await queryInterface.dropTable('subscription_invoices');
    await queryInterface.dropTable('subscriptions');
    await queryInterface.removeConstraint('vendors', 'vendors_plan_id_fk');
    await queryInterface.dropTable('plans');
  },
};
