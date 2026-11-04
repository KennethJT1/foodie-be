import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { validate } from '../../core/middlewares/index.js';
import * as controller from './subscriptions.controller.js';
import { planChoiceBody, verifyBody } from './subscriptions.schemas.js';

// The vendor's own plan, mounted at /vendor/subscription (behind the /vendor router's auth)
const router = Router();

router.get('/', asyncHandler(controller.getSubscription));
router.get('/invoices', asyncHandler(controller.listInvoices));
router.post('/trial', validate({ body: planChoiceBody }), asyncHandler(controller.startTrial));
router.post('/initialize', validate({ body: planChoiceBody }), asyncHandler(controller.initialize));
router.post('/verify', validate({ body: verifyBody }), asyncHandler(controller.verify));
router.post('/change', validate({ body: planChoiceBody }), asyncHandler(controller.change));
router.post('/cancel', asyncHandler(controller.cancel));
router.post('/resume', asyncHandler(controller.resume));

export default router;
