import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../../config/env.js';
import { redis, redisPrefix } from '../../config/redis.js';
import { RateLimitedError } from '../errors/index.js';

/**
 * Rate limiter with counters in Redis, so every API instance shares them.
 * `name` keeps each limiter's counters apart. If Redis is unreachable the request is let through
 * (passOnStoreError) rather than taking the whole API down.
 */
export const rateLimit = ({ name, windowMs = 60_000, limit, skip, keyGenerator, enabled = env.RATE_LIMITS } = {}) =>
  expressRateLimit({
    windowMs,
    limit,
    skip: (req, res) => !enabled || Boolean(skip?.(req, res)),
    ...(keyGenerator && { keyGenerator }),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    store: new RedisStore({
      prefix: `${redisPrefix}:rl:${name}:`,
      sendCommand: (command, ...args) => redis.call(command, ...args),
    }),
    handler: (req, res, next) => next(new RateLimitedError()),
  });

// /health, /health/ready and /api/v1/health: polled by load balancers and uptime monitors
export const isHealthCheck = (req) => req.path.startsWith('/health') || req.path === '/api/v1/health';

// General limit: 300 requests per minute per IP (health checks are exempt)
export const generalRateLimit = rateLimit({ name: 'general', limit: 300, skip: isHealthCheck });

// Auth routes: 5 per minute per IP, counted per route: authRateLimit('login')
export const authRateLimit = (route) => rateLimit({ name: `auth-${route}`, limit: 5 });

// OTP requests: 5 per minute per IP (the auth routes also limit per phone number)
export const otpRateLimit = rateLimit({ name: 'otp', limit: 5 });
