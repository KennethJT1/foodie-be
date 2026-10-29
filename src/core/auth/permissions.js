// Admin permissions (05-backend-handoff.md, section 2 "Roles and admin permissions"); the same
// names as the frontend's src/constants/permissions.js.
export const PERMISSIONS = Object.freeze([
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
]);

export const ADMIN_ROLES = Object.freeze(['super_admin', 'support', 'finance', 'dispatch', 'onboarding']);

// Default set per admin sub-role. Phase 7 stores these in the editable roles table (seeded from
// here, and restored by POST /admin/roles/{id}/reset); until then they are read from here.
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  super_admin: PERMISSIONS,
  support: [
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
  finance: [
    'dashboard.view',
    'orders.view',
    'payments.view',
    'subscriptions.view',
    'subscriptions.manage',
    'payouts.manage',
    'refunds.view',
    'reports.export',
  ],
  dispatch: ['dashboard.view', 'riders.view', 'orders.view', 'orders.reassign', 'live_map.view'],
  onboarding: ['dashboard.view', 'vendors.view', 'vendors.approve', 'riders.view', 'riders.approve'],
});

/** The permissions a user holds right now (non-admins hold none). */
export const permissionsFor = async (user) => {
  if (user?.role !== 'admin') return [];
  return [...(DEFAULT_ROLE_PERMISSIONS[user.adminRole] ?? [])];
};
