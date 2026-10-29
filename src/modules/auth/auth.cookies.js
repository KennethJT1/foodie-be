import { env } from '../../config/env.js';

// Refresh cookie (handoff, section 2 "Auth"): httpOnly, sent only to /api/v1/auth, 30 days
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  sameSite: env.COOKIE_SAME_SITE,
  path: '/api/v1/auth',
  // Browsers treat Domain=localhost inconsistently; host-only is right for local dev
  ...(env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost' && { domain: env.COOKIE_DOMAIN }),
});

export const readRefreshCookie = (req) => req.cookies?.[env.COOKIE_NAME];

export const setRefreshCookie = (res, token) =>
  res.cookie(env.COOKIE_NAME, token, { ...cookieOptions(), maxAge: env.JWT_REFRESH_TTL * 24 * 60 * 60 * 1000 });

export const clearRefreshCookie = (res) => res.clearCookie(env.COOKIE_NAME, cookieOptions());
