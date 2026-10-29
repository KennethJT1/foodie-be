import { ForbiddenError, UnauthenticatedError } from '../errors/index.js';
import { permissionsFor } from '../auth/permissions.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { models } from '../../db/index.js';

/** Banned / suspended accounts are refused everywhere (login, refresh and every request). */
export const assertNotBlocked = (user) => {
  if (user.status === 'banned') throw new ForbiddenError('ACCOUNT_BANNED');
  if (user.status === 'suspended') throw new ForbiddenError('ACCOUNT_SUSPENDED');
};

/** Access token → the current, not-blocked user; 401 / 403 otherwise. */
export const userFromAccessToken = async (token) => {
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) throw new UnauthenticatedError();

  const user = await models.User.findByPk(payload.sub);
  if (!user) throw new UnauthenticatedError();
  assertNotBlocked(user);
  return user;
};

/**
 * Requires `Authorization: Bearer <access token>` and loads the user fresh from the database, so
 * a ban, role change or deletion takes effect at once. Sets req.user.
 */
export const authenticate = async (req, res, next) => {
  try {
    const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
    req.user = await userFromAccessToken(scheme === 'Bearer' ? token : null);
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

/**
 * Admin endpoints: requirePermission('vendors.approve'). Checked on the server every time from the
 * role's live permission set (handoff: the UI hiding a button is not security). Use after authenticate.
 */
export const requirePermission = (permission) => async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') throw new ForbiddenError();
    if (!(await permissionsFor(req.user)).includes(permission)) throw new ForbiddenError();
    next();
  } catch (err) {
    next(err);
  }
};
