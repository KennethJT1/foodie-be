import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requireRole, validate } from '../../core/middlewares/index.js';
import { documentBody, idParams, onboardingStepBody } from '../vendors/vendors.schemas.js';
import * as controller from './riders.controller.js';
import { riderDispatchRoutes } from '../deliveries/deliveries.routes.js';

// Mounted at /rider: the signed-in rider's own application and work
const router = Router();

router.use(authenticate, requireRole('rider'));

router.get('/onboarding', asyncHandler(controller.getOnboarding));
router.patch('/onboarding', validate({ body: onboardingStepBody }), asyncHandler(controller.saveStep));
router.post('/onboarding/submit', asyncHandler(controller.submit));
router.post('/documents', validate({ body: documentBody }), asyncHandler(controller.attachDocument));
router.delete('/documents/:id', validate({ params: idParams }), asyncHandler(controller.removeDocument));
router.get('/me', asyncHandler(controller.getProfile));
router.use(riderDispatchRoutes);

export default router;
