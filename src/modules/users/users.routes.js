import { Router } from 'express';
import { ForbiddenError } from '../../core/errors/index.js';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, authRateLimit, otpRateLimit, validate } from '../../core/middlewares/index.js';
import * as controller from './users.controller.js';
import { phoneOtpBody, phoneVerifyBody, updateMeBody } from './users.schemas.js';

// Mounted at /me
const router = Router();

// Among admins only the super admin manages their own account details; other admins' details are
// set by a super admin (Admin users). GET /me stays open: every session needs it.
const canEditOwnAccount = (req, res, next) =>
  next(
    req.user.role === 'admin' && req.user.adminRole !== 'super_admin'
      ? new ForbiddenError('FORBIDDEN', 'Only a super admin can change admin account details.')
      : undefined,
  );

router.use(authenticate);
router.get('/', asyncHandler(controller.getMe));
router.patch('/', canEditOwnAccount, validate({ body: updateMeBody }), asyncHandler(controller.updateMe));
// Change or add a phone number: a code goes to the new number first
router.post(
  '/phone/otp',
  canEditOwnAccount,
  otpRateLimit,
  validate({ body: phoneOtpBody }),
  asyncHandler(controller.requestPhoneChange),
);
router.post(
  '/phone/verify',
  canEditOwnAccount,
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
