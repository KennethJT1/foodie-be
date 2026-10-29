import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, rateLimit, validate } from '../../core/middlewares/index.js';
import * as controller from './banks.controller.js';
import { resolveBody } from './banks.schemas.js';

// Mounted at /banks. The list is public (onboarding forms); resolve costs a Paystack call, so it
// needs a signed-in user and is limited per user.
const router = Router();

router.get('/', asyncHandler(controller.list));
router.post(
  '/resolve',
  authenticate,
  rateLimit({ name: 'bank-resolve', limit: 10, keyGenerator: (req) => req.user.id }),
  validate({ body: resolveBody }),
  asyncHandler(controller.resolve),
);

export default router;
