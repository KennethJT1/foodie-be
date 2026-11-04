const { TABLE_OPTIONS, foreignId, id, timestamps } = require('../migrationHelpers.cjs');

// Phase 11: vehicle, licence, guarantor, review fields and position on riders; documents and the
// payout account
module.exports = {
  async up(queryInterface, Sequelize) {
    const riderColumns = {
      onboarding_step: {
        type: Sequelize.ENUM('vehicle', 'guarantor', 'documents', 'bank', 'review', 'submitted'),
        allowNull: false,
        defaultValue: 'vehicle',
      },
      vehicle_type: { type: Sequelize.ENUM('motorcycle', 'bicycle', 'car'), allowNull: true },
      plate_number: { type: Sequelize.STRING(20), allowNull: false, defaultValue: '' },
      licence_number: { type: Sequelize.STRING(30), allowNull: false, defaultValue: '' },
      guarantor_name: { type: Sequelize.STRING(120), allowNull: true },
      guarantor_phone: { type: Sequelize.STRING(20), allowNull: true },
      guarantor_relationship: { type: Sequelize.STRING(60), allowNull: true },
      guarantor_address: { type: Sequelize.STRING(300), allowNull: true },
      rejection_reason: { type: Sequelize.STRING(500), allowNull: true },
      suspension_reason: { type: Sequelize.STRING(500), allowNull: true },
      submitted_at: { type: Sequelize.DATE(3), allowNull: true },
      approved_at: { type: Sequelize.DATE(3), allowNull: true },
      // Where the rider works and was last seen (dispatch keeps these fresh in phase 17)
      city: { type: Sequelize.STRING(100), allowNull: true },
      lat: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
      lng: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
      last_seen_at: { type: Sequelize.DATE(3), allowNull: true },
      rating: { type: Sequelize.DECIMAL(3, 2), allowNull: false, defaultValue: 0 },
      rating_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      trips_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    };
    for (const [name, definition] of Object.entries(riderColumns)) {
      await queryInterface.addColumn('riders', name, definition);
    }
    await queryInterface.addIndex('riders', ['approval_status', 'is_online'], { name: 'riders_status_online' });
    await queryInterface.addIndex('riders', ['city'], { name: 'riders_city' });

    await queryInterface.createTable(
      'rider_documents',
      {
        ...id(Sequelize),
        rider_id: foreignId(Sequelize, 'riders', { onDelete: 'CASCADE' }),
        type: { type: Sequelize.STRING(40), allowNull: false },
        label: { type: Sequelize.STRING(120), allowNull: false },
        upload_id: foreignId(Sequelize, 'uploads'),
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('rider_documents', ['rider_id', 'type'], {
      name: 'rider_documents_rider_type',
      unique: true,
    });

    // One payout account per rider (monthly statements are paid by transfer to it)
    await queryInterface.createTable(
      'rider_bank_accounts',
      {
        ...id(Sequelize),
        rider_id: { ...foreignId(Sequelize, 'riders', { onDelete: 'CASCADE' }), unique: true },
        bank_code: { type: Sequelize.STRING(20), allowNull: false },
        bank_name: { type: Sequelize.STRING(120), allowNull: false },
        account_number: { type: Sequelize.STRING(10), allowNull: false },
        account_name: { type: Sequelize.STRING(120), allowNull: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rider_bank_accounts');
    await queryInterface.dropTable('rider_documents');
    await queryInterface.removeIndex('riders', 'riders_city');
    await queryInterface.removeIndex('riders', 'riders_status_online');
    for (const name of [
      'onboarding_step',
      'vehicle_type',
      'plate_number',
      'licence_number',
      'guarantor_name',
      'guarantor_phone',
      'guarantor_relationship',
      'guarantor_address',
      'rejection_reason',
      'suspension_reason',
      'submitted_at',
      'approved_at',
      'city',
      'lat',
      'lng',
      'last_seen_at',
      'rating',
      'rating_count',
      'trips_count',
    ]) {
      await queryInterface.removeColumn('riders', name);
    }
  },
};
