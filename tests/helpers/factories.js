import { ensureAdminRoles, hashPassword, signAccessToken } from '../../src/core/auth/index.js';
import { models } from '../../src/db/index.js';

const { User, Vendor, Rider } = models;

export const PASSWORD = 'password123';
let hash;
let n = 0;

/** Creates a user (+ vendor / rider profile for those roles). Defaults are a unique customer. */
export const createUser = async ({ vendor, rider, ...overrides } = {}) => {
  hash ??= await hashPassword(PASSWORD);
  if (overrides.role === 'admin') await ensureAdminRoles();
  n += 1;
  const user = await User.create({
    role: 'customer',
    firstName: 'Test',
    lastName: `User${n}`,
    email: `user${n}.${Date.now()}@kjtfoodie.test`,
    phone: `+234803${String(Date.now() + n).slice(-7)}`,
    passwordHash: hash,
    ...overrides,
  });
  if (user.role === 'vendor') await Vendor.create({ ownerUserId: user.id, ...vendor });
  if (user.role === 'rider') await Rider.create({ userId: user.id, ...rider });
  return user;
};

/** `Authorization` header value for a user. */
export const bearer = (user) => `Bearer ${signAccessToken(user)}`;
