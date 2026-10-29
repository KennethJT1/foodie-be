import { env } from '../../config/env.js';
import { hashToken, newRefreshToken, signAccessToken } from '../../core/auth/index.js';
import { UnauthenticatedError } from '../../core/errors/index.js';
import { assertNotBlocked } from '../../core/middlewares/auth.js';
import { DAY_MS } from '../../core/utils/dates.js';
import { models, newId, withTransaction } from '../../db/index.js';
import { toUserDto } from '../users/users.presenter.js';

const { RefreshToken, User } = models;

// Two tabs refreshing at once both send the same cookie; the slower one may use a token that was
// rotated a moment ago. Within this window that is not treated as theft.
const ROTATION_GRACE_MS = 15_000;

const issueRefreshToken = async (userId, familyId, { ip, userAgent }, transaction) => {
  const token = newRefreshToken();
  await RefreshToken.create(
    {
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL * DAY_MS),
      ip: ip?.slice(0, 45),
      userAgent: userAgent?.slice(0, 255),
    },
    { transaction },
  );
  return token;
};

const session = async (user, refreshToken) => ({
  refreshToken,
  body: { accessToken: signAccessToken(user), user: await toUserDto(user) },
});

/** New sign-in: a new token family. Returns { refreshToken (for the cookie), body: Session }. */
export const startSession = async (user, context = {}, { transaction } = {}) => {
  const refreshToken = await withTransaction((t) => issueRefreshToken(user.id, newId(), context, t), { transaction });
  await user.update({ lastLoginAt: new Date() }, { transaction });
  return session(user, refreshToken);
};

const revokeFamily = (familyId, reason, transaction) =>
  RefreshToken.update(
    { revokedAt: new Date(), revokedReason: reason },
    { where: { familyId, revokedAt: null }, transaction },
  );

/**
 * POST /auth/refresh: swaps the cookie's token for a new one in the same family. Unknown,
 * expired or reused tokens are a 401 ("signed out"); reuse also revokes the whole family.
 */
export const rotateSession = async (rawToken, context = {}) => {
  if (!rawToken) throw new UnauthenticatedError();

  const result = await withTransaction(async (transaction) => {
    const current = await RefreshToken.findOne({
      where: { tokenHash: hashToken(rawToken) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current || current.expiresAt < new Date()) return null;

    if (current.revokedAt) {
      const recentlyRotated =
        current.revokedReason === 'rotated' && Date.now() - current.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!recentlyRotated) {
        // A token that was already swapped is being replayed: assume it was stolen
        await revokeFamily(current.familyId, 'reuse', transaction);
        return { reuse: true };
      }
    } else {
      await current.update({ revokedAt: new Date(), revokedReason: 'rotated' }, { transaction });
    }

    const user = await User.findByPk(current.userId, { transaction });
    if (!user) return null;
    assertNotBlocked(user);
    return { user, token: await issueRefreshToken(user.id, current.familyId, context, transaction) };
  });

  if (!result?.user) throw new UnauthenticatedError();
  return session(result.user, result.token);
};

/** POST /auth/logout: ends this sign-in (its whole family). Unknown tokens are fine. */
export const endSession = async (rawToken) => {
  if (!rawToken) return;
  const current = await RefreshToken.findOne({ where: { tokenHash: hashToken(rawToken) } });
  if (current) await revokeFamily(current.familyId, 'logout');
};

/** Signs a user out everywhere (password reset, account deletion). */
export const endAllSessions = (userId, reason, { transaction } = {}) =>
  RefreshToken.update(
    { revokedAt: new Date(), revokedReason: reason },
    { where: { userId, revokedAt: null }, transaction },
  );
