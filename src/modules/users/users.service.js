import { Op } from 'sequelize';
import { ConflictError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';
import { endAllSessions } from '../auth/sessions.service.js';
import { toUserDto } from './users.presenter.js';

const { User, Address } = models;

export const getMe = (user) => toUserDto(user);

/** PATCH /me: first / last name, email, avatar. Phone changes go through OTP (not built yet). */
export const updateMe = async (user, { firstName, lastName, email, avatar }) => {
  const changes = {};
  if (firstName !== undefined) changes.firstName = firstName;
  if (lastName !== undefined) changes.lastName = lastName;
  if (avatar !== undefined) changes.avatarUrl = avatar;

  if (email !== undefined) {
    const next = email?.trim().toLowerCase() || null;
    if (next && next !== user.email) {
      const taken = await User.findOne({ where: { email: next, id: { [Op.ne]: user.id } }, paranoid: false });
      if (taken) {
        const message = 'That email is already used by another account.';
        throw new ConflictError('CONFLICT', message, { email: message });
      }
      changes.emailVerifiedAt = null;
    }
    changes.email = next;
  }

  await user.update(changes);
  return toUserDto(user);
};

/**
 * DELETE /me (NDPA 2023): removes the customer's personal data, keeps their orders for the
 * vendors' and KJT Foodie's records (they now point at "Deleted user"), and signs out everywhere.
 */
export const deleteMe = (user) =>
  withTransaction(async (transaction) => {
    await Address.destroy({ where: { userId: user.id }, transaction });
    await endAllSessions(user.id, 'deleted', { transaction });
    await user.update(
      {
        firstName: 'Deleted',
        lastName: 'user',
        email: null,
        phone: null,
        passwordHash: null,
        googleId: null,
        avatarUrl: null,
      },
      { transaction },
    );
    await user.destroy({ transaction });
  });
