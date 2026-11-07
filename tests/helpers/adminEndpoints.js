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

// Phase 15: customers and payments
ADMIN_ENDPOINTS.push(
  ['GET', '/api/v1/admin/customers', 'customers.view'],
  ['POST', '/api/v1/admin/customers/usr_nobody/status', 'customers.ban'],
  ['GET', '/api/v1/admin/payments', 'payments.view'],
  ['POST', '/api/v1/admin/payments/pay_nobody/reconcile', 'payments.view'],
);

// Phase 17: dispatch
ADMIN_ENDPOINTS.push(
  ['POST', '/api/v1/admin/orders/ord_nobody/reassign', 'orders.reassign'],
  ['GET', '/api/v1/admin/live-map', 'live_map.view'],
);

// Phase 18: rider payouts
ADMIN_ENDPOINTS.push(
  ['GET', '/api/v1/admin/payouts', 'payouts.manage'],
  ['POST', '/api/v1/admin/payouts/pst_nobody/approve', 'payouts.manage'],
  ['POST', '/api/v1/admin/payouts/pst_nobody/mark-paid', 'payouts.manage'],
);

// Phase 19: refunds (shared routes; the admin actions need these permissions)
ADMIN_ENDPOINTS.push(
  ['POST', '/api/v1/refunds/rfd_nobody/comments', 'refunds.view'],
  ['POST', '/api/v1/refunds/rfd_nobody/escalate', 'refunds.escalate'],
);

// Phase 20: support inbox
ADMIN_ENDPOINTS.push(
  ['GET', '/api/v1/admin/tickets', 'support.manage'],
  ['GET', '/api/v1/admin/tickets/tkt_nobody', 'support.manage'],
  ['PATCH', '/api/v1/admin/tickets/tkt_nobody', 'support.manage'],
  ['POST', '/api/v1/admin/tickets/tkt_nobody/messages', 'support.manage'],
  ['GET', '/api/v1/admin/agents', 'support.manage'],
);
