const { TABLE_OPTIONS, id } = require('../migrationHelpers.cjs');

// Append-only: admin decisions and money events (handoff section 6 "Audit log")
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'audit_logs',
      {
        ...id(Sequelize),
        // null for the system (scheduled jobs, webhooks); no FK so entries outlive their actor
        actor_id: { type: Sequelize.CHAR(36), allowNull: true },
        // Copied at write time: the log shows who it was then, even after a rename or role change
        actor_name: { type: Sequelize.STRING(120), allowNull: false },
        actor_role: { type: Sequelize.STRING(32), allowNull: false },
        action: { type: Sequelize.STRING(64), allowNull: false },
        target_type: { type: Sequelize.STRING(32), allowNull: false },
        target_id: { type: Sequelize.STRING(64), allowNull: false },
        summary: { type: Sequelize.STRING(500), allowNull: false },
        ip: { type: Sequelize.STRING(45), allowNull: true },
        created_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)'),
        },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('audit_logs', ['created_at'], { name: 'audit_logs_created' });
    await queryInterface.addIndex('audit_logs', ['target_type', 'target_id'], { name: 'audit_logs_target' });
    await queryInterface.addIndex('audit_logs', ['action', 'created_at'], { name: 'audit_logs_action_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};
