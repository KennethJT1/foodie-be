import { Router } from 'express';
import { authenticate } from './core/middlewares/index.js';
import addressRoutes from './modules/addresses/addresses.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import bankRoutes from './modules/banks/banks.routes.js';
import {
  categoryRoutes,
  foodItemRoutes,
  vendorRoutes as publicVendorRoutes,
} from './modules/catalogue/catalogue.routes.js';
import { liveness } from './modules/health/health.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import uploadRoutes from './modules/uploads/uploads.routes.js';
import webhookRoutes from './modules/payments/webhook.routes.js';
import orderRoutes, { checkoutRoutes, mePaymentRoutes, paymentRoutes } from './modules/orders/orders.routes.js';
import riderRoutes from './modules/riders/riders.routes.js';
import {
  commentRoutes,
  feedRoutes,
  foodItemSocialRoutes,
  meSocialRoutes,
  reportRoutes,
  vendorFollowRoutes,
} from './modules/social/social.routes.js';
import * as subscriptions from './modules/subscriptions/subscriptions.controller.js';
import { asyncHandler } from './core/http/index.js';
import userRoutes from './modules/users/users.routes.js';
import vendorRoutes from './modules/vendors/vendors.routes.js';

// Module routers are mounted here under /api/v1 as each phase adds them
const router = Router();

router.get('/health', liveness);
router.use('/auth', authRoutes);
router.use('/me', meSocialRoutes);
router.use('/me', mePaymentRoutes);
router.use('/me', userRoutes);
router.use('/addresses', addressRoutes);
router.use('/notifications', authenticate, notificationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/banks', bankRoutes);
router.get('/plans', asyncHandler(subscriptions.listPlans));
router.use('/categories', categoryRoutes);
router.use('/feed', feedRoutes);
router.use('/food-items', foodItemSocialRoutes);
router.use('/food-items', foodItemRoutes);
router.use('/comments', commentRoutes);
router.use('/reports', reportRoutes);
router.use('/vendors', vendorFollowRoutes);
router.use('/vendors', publicVendorRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/payments', paymentRoutes);
router.use('/orders', orderRoutes);
router.use('/vendor', vendorRoutes);
router.use('/rider', riderRoutes);
router.use('/admin', adminRoutes);

export default router;
