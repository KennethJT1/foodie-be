import { Router } from 'express';
import { sequelize } from '../../db/index.js';
import { AppError } from '../../core/errors/index.js';
import { asyncHandler, respond } from '../../core/http/index.js';

const router = Router();

// Process is up
router.get('/', (req, res) => {
  respond.ok(res, { status: 'ok', uptime: Math.round(process.uptime()) });
});

// Dependencies are reachable (MySQL now; Redis joins in phase 5)
router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    try {
      await sequelize.authenticate();
    } catch (err) {
      req.log.warn({ err }, 'Readiness check failed: MySQL');
      throw new AppError('MySQL is not reachable', { code: 'INTERNAL', status: 503 });
    }
    respond.ok(res, { status: 'ready', checks: { mysql: 'up' } });
  }),
);

export default router;
