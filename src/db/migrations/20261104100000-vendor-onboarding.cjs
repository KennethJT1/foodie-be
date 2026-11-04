const { TABLE_OPTIONS, foreignId, id, timestamps } = require('../migrationHelpers.cjs');

// Phase 10: storefront and onboarding fields on vendors, documents, opening hours, the settlement
// account and bank change requests (BR-PAY-02)
module.exports = {
  async up(queryInterface, Sequelize) {
    const vendorColumns = {
      description: { type: Sequelize.STRING(300), allowNull: false, defaultValue: '' },
      // Business contact number (E.164), not the owner's login phone
      phone: { type: Sequelize.STRING(20), allowNull: true },
      cover_url: { type: Sequelize.STRING(500), allowNull: true },
      address_line1: { type: Sequelize.STRING(200), allowNull: true },
      area: { type: Sequelize.STRING(100), allowNull: true },
      city: { type: Sequelize.STRING(100), allowNull: true },
      state: { type: Sequelize.STRING(100), allowNull: true },
      lat: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
      lng: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
      delivery_radius_km: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 5 },
      prep_time_mins: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 20 },
      // Manual pause from store settings (phase 13)
      is_paused: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      rejection_reason: { type: Sequelize.STRING(500), allowNull: true },
      suspension_reason: { type: Sequelize.STRING(500), allowNull: true },
      submitted_at: { type: Sequelize.DATE(3), allowNull: true },
      approved_at: { type: Sequelize.DATE(3), allowNull: true },
      // Denormalised counters (reviews, follows and refunds keep them up to date)
      rating: { type: Sequelize.DECIMAL(3, 2), allowNull: false, defaultValue: 0 },
      rating_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      followers_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      refund_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    };
    for (const [name, definition] of Object.entries(vendorColumns)) {
      await queryInterface.addColumn('vendors', name, definition);
    }
    await queryInterface.addIndex('vendors', ['city'], { name: 'vendors_city' });
    await queryInterface.addIndex('vendors', ['submitted_at'], { name: 'vendors_submitted_at' });

    // One per required type; a new upload replaces the old one
    await queryInterface.createTable(
      'vendor_documents',
      {
        ...id(Sequelize),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        type: { type: Sequelize.STRING(40), allowNull: false },
        label: { type: Sequelize.STRING(120), allowNull: false },
        // The private file from POST /uploads; links are re-signed when shown
        upload_id: foreignId(Sequelize, 'uploads'),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('vendor_documents', ['vendor_id', 'type'], {
      name: 'vendor_documents_vendor_type',
      unique: true,
    });

    await queryInterface.createTable(
      'vendor_opening_hours',
      {
        ...id(Sequelize),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        // 0 = Sunday, as the contract
        day: { type: Sequelize.TINYINT, allowNull: false },
        // HH:MM in Africa/Lagos
        opens_at: { type: Sequelize.CHAR(5), allowNull: false, defaultValue: '09:00' },
        closes_at: { type: Sequelize.CHAR(5), allowNull: false, defaultValue: '21:00' },
        is_closed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('vendor_opening_hours', ['vendor_id', 'day'], {
      name: 'vendor_opening_hours_vendor_day',
      unique: true,
    });

    // Settlement accounts: one `active`; approved bank changes mark the old one `replaced`
    await queryInterface.createTable(
      'vendor_bank_accounts',
      {
        ...id(Sequelize),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        bank_code: { type: Sequelize.STRING(20), allowNull: false },
        bank_name: { type: Sequelize.STRING(120), allowNull: false },
        account_number: { type: Sequelize.STRING(10), allowNull: false },
        account_name: { type: Sequelize.STRING(120), allowNull: false },
        status: { type: Sequelize.ENUM('active', 'replaced'), allowNull: false, defaultValue: 'active' },
        // Paystack split-payment subaccount for this account (created after approval)
        paystack_subaccount_code: { type: Sequelize.STRING(40), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('vendor_bank_accounts', ['vendor_id', 'status'], {
      name: 'vendor_bank_accounts_vendor_status',
    });

    await queryInterface.createTable(
      'bank_change_requests',
      {
        ...id(Sequelize),
        vendor_id: foreignId(Sequelize, 'vendors', { onDelete: 'CASCADE' }),
        bank_code: { type: Sequelize.STRING(20), allowNull: false },
        bank_name: { type: Sequelize.STRING(120), allowNull: false },
        account_number: { type: Sequelize.STRING(10), allowNull: false },
        account_name: { type: Sequelize.STRING(120), allowNull: false },
        status: {
          type: Sequelize.ENUM('pending', 'approved', 'rejected'),
          allowNull: false,
          defaultValue: 'pending',
        },
        decided_by: foreignId(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
        decided_at: { type: Sequelize.DATE(3), allowNull: true },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('bank_change_requests', ['vendor_id', 'status'], {
      name: 'bank_change_requests_vendor_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bank_change_requests');
    await queryInterface.dropTable('vendor_bank_accounts');
    await queryInterface.dropTable('vendor_opening_hours');
    await queryInterface.dropTable('vendor_documents');
    await queryInterface.removeIndex('vendors', 'vendors_submitted_at');
    await queryInterface.removeIndex('vendors', 'vendors_city');
    for (const name of [
      'description',
      'phone',
      'cover_url',
      'address_line1',
      'area',
      'city',
      'state',
      'lat',
      'lng',
      'delivery_radius_km',
      'prep_time_mins',
      'is_paused',
      'rejection_reason',
      'suspension_reason',
      'submitted_at',
      'approved_at',
      'rating',
      'rating_count',
      'followers_count',
      'refund_rate',
    ]) {
      await queryInterface.removeColumn('vendors', name);
    }
  },
};
