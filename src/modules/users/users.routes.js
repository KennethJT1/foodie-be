import { Router } from 'express';
import { ForbiddenError } from '../../core/errors/index.js';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, validate } from '../../core/middlewares/index.js';
import * as controller from './users.controller.js';
import { updateMeBody } from './users.schemas.js';

// Mounted at /me
const router = Router();

router.use(authenticate);
router.get('/', asyncHandler(controller.getMe));
router.patch('/', validate({ body: updateMeBody }), asyncHandler(controller.updateMe));
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
