import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requirePermission, requireRole, validate } from '../../core/middlewares/index.js';
import * as controller from './admin.controller.js';
import { updateSettingsBody } from '../settings/settings.schemas.js';
import { createAdminBody, idParams, updateAdminBody, updateRoleBody } from './admin.schemas.js';
import * as riders from '../riders/riders.controller.js';
import * as vendors from '../vendors/vendors.controller.js';
import { bankChangeParams, decisionBody } from '../vendors/vendors.schemas.js';

// Mounted at /admin. Every route names its permission (x-permission in the contract).
const router = Router();

router.use(authenticate, requireRole('admin'));

const manage = requirePermission('admin_users.manage');
router.get('/users', manage, asyncHandler(controller.listAdmins));
router.post('/users', manage, validate({ body: createAdminBody }), asyncHandler(controller.createAdmin));
router.patch(
  '/users/:id',
  manage,
  validate({ params: idParams, body: updateAdminBody }),
  asyncHandler(controller.updateAdmin),
);
router.get('/roles', manage, asyncHandler(controller.listRoles));
router.patch(
  '/roles/:id',
  manage,
  validate({ params: idParams, body: updateRoleBody }),
  asyncHandler(controller.updateRole),
);
router.post('/roles/:id/reset', manage, validate({ params: idParams }), asyncHandler(controller.resetRole));

router.get('/audit-log', requirePermission('audit_log.view'), asyncHandler(controller.listAuditLog));

const settingsManage = requirePermission('settings.manage');
router.get('/settings', settingsManage, asyncHandler(controller.getSettings));
router.patch(
  '/settings',
  settingsManage,
  validate({ body: updateSettingsBody }),
  asyncHandler(controller.updateSettings),
);

const vendorsView = requirePermission('vendors.view');
const vendorsApprove = requirePermission('vendors.approve');
router.get('/vendors', vendorsView, asyncHandler(vendors.listVendors));
router.get('/vendors/:id', vendorsView, validate({ params: idParams }), asyncHandler(vendors.getVendor));
for (const action of ['approve', 'reject', 'suspend', 'reinstate']) {
  router.post(
    `/vendors/:id/${action}`,
    vendorsApprove,
    validate({ params: idParams, body: decisionBody }),
    asyncHandler(vendors.decide(action)),
  );
}
router.post(
  '/vendors/:id/bank-change/:decision',
  vendorsApprove,
  validate({ params: bankChangeParams }),
  asyncHandler(vendors.decideBankChange),
);

const ridersView = requirePermission('riders.view');
const ridersApprove = requirePermission('riders.approve');
router.get('/riders', ridersView, asyncHandler(riders.listRiders));
router.get('/riders/:id', ridersView, validate({ params: idParams }), asyncHandler(riders.getRider));
for (const action of ['approve', 'reject', 'suspend', 'reinstate']) {
  router.post(
    `/riders/:id/${action}`,
    ridersApprove,
    validate({ params: idParams, body: decisionBody }),
    asyncHandler(riders.decide(action)),
  );
}

export default router;
