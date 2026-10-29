import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requirePermission, requireRole, validate } from '../../core/middlewares/index.js';
import * as controller from './admin.controller.js';
import { createAdminBody, idParams, updateAdminBody, updateRoleBody } from './admin.schemas.js';

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

export default router;
