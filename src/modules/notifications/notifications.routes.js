import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { validate } from '../../core/middlewares/index.js';
import * as controller from './notifications.controller.js';
import { notificationIdParams } from './notifications.schemas.js';

// Mounted at /notifications behind `authenticate` (phase 6); every handler reads req.user.id
const router = Router();

router.get('/', asyncHandler(controller.list));
router.get('/unread-count', asyncHandler(controller.unreadCount));
router.post('/read-all', asyncHandler(controller.markAllRead));
router.post('/:id/read', validate({ params: notificationIdParams }), asyncHandler(controller.markRead));

export default router;
