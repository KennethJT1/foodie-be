import { Router } from 'express';
import { redis } from '../../config/redis.js';
import { sequelize } from '../../db/index.js';
import { AppError } from '../../core/errors/index.js';
import { asyncHandler, respond } from '../../core/http/index.js';

// Process is up. Served at GET /api/v1/health (contract) and GET /health (load balancers)
export const liveness = (req, res) => {
  respond.ok(res, { status: 'ok', time: new Date().toISOString(), uptime: Math.round(process.uptime()) });
};

const CHECKS = {
  mysql: () => sequelize.authenticate(),
  redis: () => redis.ping(),
};

const router = Router();

router.get('/', liveness);

// Dependencies are reachable: 503 when any of them is down
router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    const results = await Promise.allSettled(Object.values(CHECKS).map((check) => check()));
    const checks = Object.fromEntries(
      Object.keys(CHECKS).map((name, i) => [name, results[i].status === 'fulfilled' ? 'up' : 'down']),
    );

    const down = Object.keys(checks).filter((name) => checks[name] === 'down');
    if (down.length) {
      req.log.warn({ checks, errors: results.filter((r) => r.reason).map((r) => r.reason.message) }, 'Not ready');
      throw new AppError('INTERNAL_ERROR', `Not ready: ${down.join(', ')} unreachable.`, { status: 503 });
    }
    respond.ok(res, { status: 'ready', checks });
  }),
);

export default router;
