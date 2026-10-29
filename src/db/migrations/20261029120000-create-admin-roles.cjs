const { TABLE_OPTIONS, timestamps } = require('../migrationHelpers.cjs');

// Defaults from 05-backend-handoff.md section 2; keep in step with src/core/auth/permissions.js
const PERMISSIONS = [
  'dashboard.view',
  'vendors.view',
  'vendors.approve',
  'riders.view',
  'riders.approve',
  'customers.view',
  'customers.ban',
  'orders.view',
  'orders.reassign',
  'live_map.view',
  'payments.view',
  'subscriptions.view',
  'subscriptions.manage',
  'payouts.manage',
  'refunds.view',
  'refunds.escalate',
  'moderation.manage',
  'support.manage',
  'settings.manage',
  'admin_users.manage',
  'audit_log.view',
  'reports.export',
];
const ROLES = {
  super_admin: ['Super admin', PERMISSIONS],
  support: [
    'Support',
    [
      'dashboard.view',
      'customers.view',
      'vendors.view',
      'riders.view',
      'orders.view',
      'refunds.view',
      'refunds.escalate',
      'moderation.manage',
      'support.manage',
    ],
  ],
  finance: [
    'Finance',
    [
      'dashboard.view',
      'orders.view',
      'payments.view',
      'subscriptions.view',
      'subscriptions.manage',
      'payouts.manage',
      'refunds.view',
      'reports.export',
    ],
  ],
  dispatch: ['Dispatch', ['dashboard.view', 'riders.view', 'orders.view', 'orders.reassign', 'live_map.view']],
  onboarding: ['Onboarding', ['dashboard.view', 'vendors.view', 'vendors.approve', 'riders.view', 'riders.approve']],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'permissions',
      {
        id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.createTable(
      'admin_roles',
      {
        // Slug: super_admin, support, finance, dispatch, onboarding
        id: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(60), allowNull: false },
        // super_admin: always every permission, can't be edited
        is_locked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.createTable(
      'admin_role_permissions',
      {
        role_id: {
          type: Sequelize.STRING(32),
          primaryKey: true,
          references: { model: 'admin_roles', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        permission_id: {
          type: Sequelize.STRING(64),
          primaryKey: true,
          references: { model: 'permissions', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        ...timestamps(Sequelize),
      },
      TABLE_OPTIONS,
    );

    const now = new Date();
    await queryInterface.bulkInsert(
      'permissions',
      PERMISSIONS.map((id) => ({ id, created_at: now, updated_at: now })),
    );
    await queryInterface.bulkInsert(
      'admin_roles',
      Object.entries(ROLES).map(([id, [name]]) => ({
        id,
        name,
        is_locked: id === 'super_admin',
        created_at: now,
        updated_at: now,
      })),
    );
    await queryInterface.bulkInsert(
      'admin_role_permissions',
      Object.entries(ROLES).flatMap(([roleId, [, permissions]]) =>
        permissions.map((permissionId) => ({
          role_id: roleId,
          permission_id: permissionId,
          created_at: now,
          updated_at: now,
        })),
      ),
    );

    // Existing admin_role values are these slugs already (phase 6)
    await queryInterface.addConstraint('users', {
      type: 'foreign key',
      name: 'users_admin_role_fk',
      fields: ['admin_role'],
      references: { table: 'admin_roles', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('users', 'users_admin_role_fk');
    await queryInterface.dropTable('admin_role_permissions');
    await queryInterface.dropTable('admin_roles');
    await queryInterface.dropTable('permissions');
  },
};
