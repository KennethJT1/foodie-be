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
];
