import { Router } from 'express';
import { ForbiddenError } from '../../core/errors/index.js';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, authRateLimit, otpRateLimit, validate } from '../../core/middlewares/index.js';
import * as controller from './users.controller.js';
import { phoneOtpBody, phoneVerifyBody, updateMeBody } from './users.schemas.js';

// Mounted at /me
const router = Router();

router.use(authenticate);
router.get('/', asyncHandler(controller.getMe));
router.patch('/', validate({ body: updateMeBody }), asyncHandler(controller.updateMe));
// Change or add a phone number: a code goes to the new number first
router.post('/phone/otp', otpRateLimit, validate({ body: phoneOtpBody }), asyncHandler(controller.requestPhoneChange));
router.post(
  '/phone/verify',
  authRateLimit('phone-verify'),
  validate({ body: phoneVerifyBody }),
  asyncHandler(controller.verifyPhoneChange),
);
router.delete(
  '/',
  (req, res, next) =>
    next(
      req.user.role === 'customer'
        ? undefined
        : new ForbiddenError('FORBIDDEN', 'Only customers can delete their own account here. Contact support instead.'),
    ),
  asyncHandler(controller.deleteMe),
);

export default router;
