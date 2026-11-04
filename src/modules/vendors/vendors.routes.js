import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requireRole, validate } from '../../core/middlewares/index.js';
import subscriptionRoutes from '../subscriptions/subscriptions.routes.js';
import * as controller from './vendors.controller.js';
import { documentBody, idParams, onboardingStepBody } from './vendors.schemas.js';

// Mounted at /vendor: the signed-in vendor's own store. Later phases add menu, store, staff...
const router = Router();

router.use(authenticate, requireRole('vendor'));

router.get('/onboarding', asyncHandler(controller.getOnboarding));
router.patch('/onboarding', validate({ body: onboardingStepBody }), asyncHandler(controller.saveStep));
router.post('/onboarding/submit', asyncHandler(controller.submit));
router.post('/documents', validate({ body: documentBody }), asyncHandler(controller.attachDocument));
router.delete('/documents/:id', validate({ params: idParams }), asyncHandler(controller.removeDocument));
router.use('/subscription', subscriptionRoutes);

export default router;
