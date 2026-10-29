import { ForbiddenError, UnauthenticatedError } from '../errors/index.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { models } from '../../db/index.js';

/** Banned / suspended accounts are refused everywhere (login, refresh and every request). */
export const assertNotBlocked = (user) => {
  if (user.status === 'banned') throw new ForbiddenError('ACCOUNT_BANNED');
  if (user.status === 'suspended') throw new ForbiddenError('ACCOUNT_SUSPENDED');
};

/**
 * Requires `Authorization: Bearer <access token>` and loads the user fresh from the database, so
 * a ban, role change or deletion takes effect at once. Sets req.user.
 */
export const authenticate = async (req, res, next) => {
  try {
    const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
    const payload = scheme === 'Bearer' && token ? verifyAccessToken(token) : null;
    if (!payload) throw new UnauthenticatedError();

    const user = await models.User.findByPk(payload.sub);
    if (!user) throw new UnauthenticatedError();
    assertNotBlocked(user);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Only these roles may continue: requireRole('customer'). Use after authenticate. */
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) return next(new ForbiddenError());
    next();
  };
