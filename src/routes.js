import { Router } from 'express';
import { authenticate } from './core/middlewares/index.js';
import addressRoutes from './modules/addresses/addresses.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import bankRoutes from './modules/banks/banks.routes.js';
import { liveness } from './modules/health/health.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import uploadRoutes from './modules/uploads/uploads.routes.js';
import riderRoutes from './modules/riders/riders.routes.js';
import userRoutes from './modules/users/users.routes.js';
import vendorRoutes from './modules/vendors/vendors.routes.js';

// Module routers are mounted here under /api/v1 as each phase adds them
const router = Router();

router.get('/health', liveness);
router.use('/auth', authRoutes);
router.use('/me', userRoutes);
router.use('/addresses', addressRoutes);
router.use('/notifications', authenticate, notificationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/banks', bankRoutes);
router.use('/vendor', vendorRoutes);
router.use('/rider', riderRoutes);
router.use('/admin', adminRoutes);

export default router;
