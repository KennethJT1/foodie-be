import { Op, UniqueConstraintError } from 'sequelize';
import { logger } from '../../config/logger.js';
import { ConflictError, ValidationError } from '../../core/errors/index.js';
import { addJob } from '../../core/queue/index.js';
import { normalisePhone } from '../../core/utils/phone.js';
import { models, withTransaction } from '../../db/index.js';
import { consumeOtp, issueOtp } from '../auth/otp.service.js';
import { endAllSessions } from '../auth/sessions.service.js';
import { toUserDto } from './users.presenter.js';

const { User, Address } = models;

export const getMe = (user) => toUserDto(user);

/** PATCH /me: first / last name, email, avatar. Phone changes go through /me/phone (OTP). */
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

const PHONE_INVALID = 'Enter a valid Nigerian phone number';
const PHONE_TAKEN = 'That phone number is already used by another account.';

/** The new number, normalised, after checking it is valid, different and free. */
const checkNewPhone = async (user, rawPhone) => {
  const phone = normalisePhone(rawPhone);
  if (!phone) throw new ValidationError({ phone: PHONE_INVALID });
  if (phone === user.phone) throw new ValidationError({ phone: 'That is already your phone number.' });
  const taken = await User.findOne({ where: { phone, id: { [Op.ne]: user.id } }, paranoid: false });
  if (taken) throw new ConflictError('CONFLICT', PHONE_TAKEN, { phone: PHONE_TAKEN });
  return phone;
};

// A code is only good for this account and this number, so it can't be replayed elsewhere
const phoneChangeIdentifier = (user, phone) => `${user.id}:${phone}`;

/**
 * POST /me/phone/otp: sends a code to the new number. The number isn't saved until the code
 * comes back through POST /me/phone/verify, so a typo can never lock anyone out.
 */
export const requestPhoneChange = async (user, { phone: rawPhone }) => {
  const phone = await checkNewPhone(user, rawPhone);
  const { otp, code, expiresInSec } = await issueOtp({
    identifier: phoneChangeIdentifier(user, phone),
    purpose: 'phone_change',
  });
  await addJob('notifications', 'sms.send', {
    to: phone,
    text: `Your KJT Foodie code to confirm this phone number is ${code}. It expires in 5 minutes. Don't share it with anyone.`,
  });
  return { otpRequestId: otp.id, phone, expiresInSec };
};

/** POST /me/phone/verify: checks the code, then saves the new number as verified. */
export const verifyPhoneChange = async (user, { phone: rawPhone, code }) => {
  const phone = await checkNewPhone(user, rawPhone);
  await consumeOtp({ identifier: phoneChangeIdentifier(user, phone), purposes: ['phone_change'], code });

  const oldPhone = user.phone;
  try {
    await user.update({ phone, phoneVerifiedAt: new Date() });
  } catch (err) {
    // Someone else took the number between the check and the save
    if (err instanceof UniqueConstraintError) throw new ConflictError('CONFLICT', PHONE_TAKEN, { phone: PHONE_TAKEN });
    throw err;
  }

  // Tell the old number, so a change the owner didn't make doesn't go unnoticed
  if (oldPhone) {
    await addJob('notifications', 'sms.send', {
      to: oldPhone,
      text: `Your KJT Foodie phone number was changed to a number ending in ${phone.slice(-4)}. If this wasn't you, contact support now.`,
    }).catch((err) => logger.error({ err, userId: user.id }, 'Could not queue the phone change notice'));
  }
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
