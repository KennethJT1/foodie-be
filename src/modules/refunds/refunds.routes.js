import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requirePermission, requireRole, validate } from '../../core/middlewares/index.js';
import { idParams } from '../vendors/vendors.schemas.js';
import * as controller from './refunds.controller.js';
import { commentBody, createRefundBody, reasonBody, referenceBody, respondBody } from './refunds.schemas.js';

// /refunds: shared by customers, vendors and admins (handoff: refunds aren't under /admin)
const router = Router();
const customer = requireRole('customer');
const vendor = requireRole('vendor');
const withId = (body) => validate({ params: idParams, ...(body && { body }) });

router.use(authenticate);
router.get('/', asyncHandler(controller.listRefunds));
router.post('/', customer, validate({ body: createRefundBody }), asyncHandler(controller.createRefund));
router.get('/:id', withId(), asyncHandler(controller.getRefund));
router.post('/:id/confirm', customer, withId(), asyncHandler(controller.confirmRefund));
router.post('/:id/dispute', customer, withId(reasonBody), asyncHandler(controller.disputeRefund));
router.post('/:id/respond', vendor, withId(respondBody), asyncHandler(controller.respondToRefund));
router.post('/:id/mark-paid', vendor, withId(referenceBody), asyncHandler(controller.markRefundPaid));
router.post(
  '/:id/comments',
  requirePermission('refunds.view'),
  withId(commentBody),
  asyncHandler(controller.addComment),
);
router.post(
  '/:id/escalate',
  requirePermission('refunds.escalate'),
  withId(reasonBody),
  asyncHandler(controller.escalateRefund),
);

export default router;
