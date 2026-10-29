import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const ISSUER = 'kjt-foodie-api';

/** Short-lived access token (Authorization: Bearer). Carries the user id only; roles are re-read. */
export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: ISSUER,
    algorithm: 'HS256',
  });

/** The token's payload, or null when it is missing, forged or expired. */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
  } catch {
    return null;
  }
};

/** Opaque refresh token for the cookie: 48 random bytes. Only its hash is stored. */
export const newRefreshToken = () => randomBytes(48).toString('base64url');

/** SHA-256 hex, keyed with the refresh secret so a leaked table can't be matched offline. */
export const hashToken = (value) => createHash('sha256').update(`${env.JWT_REFRESH_SECRET}:${value}`).digest('hex');

export const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
