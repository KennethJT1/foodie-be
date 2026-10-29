import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { asyncHandler } from '../../core/http/index.js';
import { authRateLimit, otpRateLimit, rateLimit, validate } from '../../core/middlewares/index.js';
import { normalisePhone } from '../../core/utils/phone.js';
import * as controller from './auth.controller.js';
import * as schemas from './auth.schemas.js';

// Also 5 OTPs per 10 minutes per phone number, whatever the IP
const otpPerPhone = rateLimit({
  name: 'otp-phone',
  windowMs: 10 * 60_000,
  limit: 5,
  keyGenerator: (req) => normalisePhone(req.body?.phone) ?? ipKeyGenerator(req.ip),
});

const router = Router();

router.post(
  '/register',
  authRateLimit('register'),
  validate({ body: schemas.registerBody }),
  asyncHandler(controller.register),
);
router.post('/login', authRateLimit('login'), validate({ body: schemas.loginBody }), asyncHandler(controller.login));
router.post(
  '/otp/request',
  otpRateLimit,
  otpPerPhone,
  validate({ body: schemas.otpRequestBody }),
  asyncHandler(controller.requestOtp),
);
router.post(
  '/otp/verify',
  authRateLimit('otp-verify'),
  validate({ body: schemas.otpVerifyBody }),
  asyncHandler(controller.verifyOtp),
);
router.post(
  '/google',
  authRateLimit('google'),
  validate({ body: schemas.googleBody }),
  asyncHandler(controller.google),
);
// Called on every page load: the general limit is enough
router.post('/refresh', asyncHandler(controller.refresh));
// Works with an expired access token too: the refresh cookie identifies the session
router.post('/logout', asyncHandler(controller.logout));
router.post(
  '/password/forgot',
  authRateLimit('password-forgot'),
  validate({ body: schemas.forgotBody }),
  asyncHandler(controller.forgotPassword),
);
router.post(
  '/password/reset',
  authRateLimit('password-reset'),
  validate({ body: schemas.resetBody }),
  asyncHandler(controller.resetPassword),
);

export default router;
