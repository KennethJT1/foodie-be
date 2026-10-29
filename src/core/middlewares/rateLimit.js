import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { RateLimitedError } from '../errors/index.js';

// In-memory store for now; switches to the Redis store when Redis is added (phase 5)
export const rateLimit = ({ windowMs = 60_000, limit, skip } = {}) =>
  expressRateLimit({
    windowMs,
    limit,
    skip,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new RateLimitedError()),
  });

// /health, /health/ready and /api/v1/health: polled by load balancers and uptime monitors
export const isHealthCheck = (req) => req.path.startsWith('/health') || req.path === '/api/v1/health';

// General limit: 300 requests per minute per IP (health checks are exempt)
export const generalRateLimit = rateLimit({ limit: 300, skip: isHealthCheck });
