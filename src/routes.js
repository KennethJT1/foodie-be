import { Router } from 'express';
import { liveness } from './modules/health/health.routes.js';

// Module routers are mounted here under /api/v1 as each phase adds them
const router = Router();

router.get('/health', liveness);

export default router;
