import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis, redisPrefix } from '../../config/redis.js';
import { RateLimitedError } from '../errors/index.js';

/**
 * Rate limiter with counters in Redis, so every API instance shares them.
 * `name` keeps each limiter's counters apart. If Redis is unreachable the request is let through
 * (passOnStoreError) rather than taking the whole API down.
 */
export const rateLimit = ({ name, windowMs = 60_000, limit, skip, keyGenerator } = {}) =>
  expressRateLimit({
    windowMs,
    limit,
    skip,
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

// Login, sign-up, password reset: 5 per minute per IP (mounted on the auth routes in phase 6)
export const authRateLimit = rateLimit({ name: 'auth', limit: 5 });

// OTP requests: 5 per minute per IP (phase 6 also limits per phone number)
export const otpRateLimit = rateLimit({ name: 'otp', limit: 5 });
