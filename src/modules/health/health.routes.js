import { Router } from 'express';
import { sequelize } from '../../db/index.js';
import { AppError } from '../../core/errors/index.js';
import { asyncHandler, respond } from '../../core/http/index.js';

// Process is up. Served at GET /api/v1/health (contract) and GET /health (load balancers)
export const liveness = (req, res) => {
  respond.ok(res, { status: 'ok', time: new Date().toISOString(), uptime: Math.round(process.uptime()) });
};

const router = Router();

router.get('/', liveness);

// Dependencies are reachable (MySQL now; Redis joins in phase 5)
router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    try {
      await sequelize.authenticate();
    } catch (err) {
      req.log.warn({ err }, 'Readiness check failed: MySQL');
      throw new AppError('INTERNAL_ERROR', "The database isn't reachable right now.", { status: 503 });
    }
    respond.ok(res, { status: 'ready', checks: { mysql: 'up' } });
  }),
);

export default router;
