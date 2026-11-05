// Every admin endpoint and its permission (x-permission in the contract). Each phase adds its own;
// the permission matrix test checks every admin sub-role against every row.
// Write requests send an empty body, so an allowed call stops at validation and changes nothing.
export const ADMIN_ENDPOINTS = [
  ['GET', '/api/v1/admin/users', 'admin_users.manage'],
  ['POST', '/api/v1/admin/users', 'admin_users.manage'],
  ['PATCH', '/api/v1/admin/users/usr_nobody', 'admin_users.manage'],
  ['GET', '/api/v1/admin/roles', 'admin_users.manage'],
  ['PATCH', '/api/v1/admin/roles/support', 'admin_users.manage'],
  ['POST', '/api/v1/admin/roles/missing_role/reset', 'admin_users.manage'],
  ['GET', '/api/v1/admin/audit-log', 'audit_log.view'],
  ['GET', '/api/v1/admin/settings', 'settings.manage'],
  ['PATCH', '/api/v1/admin/settings', 'settings.manage'],
];

// Phase 10: vendor review
ADMIN_ENDPOINTS.push(
  ['GET', '/api/v1/admin/vendors', 'vendors.view'],
  ['GET', '/api/v1/admin/vendors/ven_nobody', 'vendors.view'],
  ['POST', '/api/v1/admin/vendors/ven_nobody/approve', 'vendors.approve'],
  ['POST', '/api/v1/admin/vendors/ven_nobody/reject', 'vendors.approve'],
  ['POST', '/api/v1/admin/vendors/ven_nobody/suspend', 'vendors.approve'],
  ['POST', '/api/v1/admin/vendors/ven_nobody/reinstate', 'vendors.approve'],
  ['POST', '/api/v1/admin/vendors/ven_nobody/bank-change/approve', 'vendors.approve'],
);

// Phase 11: rider review
ADMIN_ENDPOINTS.push(
  ['GET', '/api/v1/admin/riders', 'riders.view'],
  ['GET', '/api/v1/admin/riders/rid_nobody', 'riders.view'],
  ['POST', '/api/v1/admin/riders/rid_nobody/approve', 'riders.approve'],
  ['POST', '/api/v1/admin/riders/rid_nobody/reject', 'riders.approve'],
  ['POST', '/api/v1/admin/riders/rid_nobody/suspend', 'riders.approve'],
  ['POST', '/api/v1/admin/riders/rid_nobody/reinstate', 'riders.approve'],
);

// Phase 12: plans and subscriptions
ADMIN_ENDPOINTS.push(
  ['GET', '/api/v1/admin/plans', 'subscriptions.view'],
  ['POST', '/api/v1/admin/plans', 'subscriptions.manage'],
  ['PATCH', '/api/v1/admin/plans/plan_nobody', 'subscriptions.manage'],
  ['GET', '/api/v1/admin/subscriptions', 'subscriptions.view'],
  ['POST', '/api/v1/admin/subscriptions/sub_nobody/extend', 'subscriptions.manage'],
);

// Phase 14: moderation
ADMIN_ENDPOINTS.push(
  ['GET', '/api/v1/admin/reports', 'moderation.manage'],
  ['POST', '/api/v1/admin/reports/rep_nobody/resolve', 'moderation.manage'],
);
