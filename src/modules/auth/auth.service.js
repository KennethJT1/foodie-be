import { logger } from '../../config/logger.js';
import { checkPassword, hashPassword } from '../../core/auth/index.js';
import { BadRequestError, ConflictError, UnauthenticatedError, ValidationError } from '../../core/errors/index.js';
import { assertNotBlocked } from '../../core/middlewares/auth.js';
import { addJob } from '../../core/queue/index.js';
import { normalisePhone } from '../../core/utils/phone.js';
import { models, withTransaction } from '../../db/index.js';
import { google } from '../../integrations/google/google.client.js';
import { consumeOtp, issueOtp } from './otp.service.js';
import { endAllSessions, startSession } from './sessions.service.js';

const { User, Vendor, Rider } = models;

const PHONE_INVALID = 'Enter a valid Nigerian phone number';

const otpSms = (code, purpose) =>
  purpose === 'reset'
    ? `Your KJT Foodie password reset code is ${code}. It expires in 10 minutes.`
    : `Your KJT Foodie code is ${code}. It expires in 5 minutes. Don't share it with anyone.`;

const sendOtp = ({ to, code, purpose, channel = 'sms' }) =>
  channel === 'email'
    ? addJob('notifications', 'email.send', { to, subject: 'Your KJT Foodie reset code', text: otpSms(code, purpose) })
    : addJob('notifications', 'sms.send', { to, text: otpSms(code, purpose) });

const findByPhone = (phone) => User.findOne({ where: { phone } });

/** Email or phone → the account, or null. */
const findByIdentifier = (identifier = '') => {
  const value = String(identifier).trim();
  if (value.includes('@')) return User.findOne({ where: { email: value.toLowerCase() } });
  const phone = normalisePhone(value);
  return phone ? findByPhone(phone) : null;
};

/**
 * POST /auth/register. Vendors and riders also get an empty profile (approvalStatus: draft).
 * Sends a `verify` OTP; the account signs in when the code is checked.
 */
export const register = async ({ role, firstName, lastName, email, phone: rawPhone, password }) => {
  const phone = normalisePhone(rawPhone);
  if (!phone) throw new ValidationError({ phone: PHONE_INVALID });
  email = email?.trim().toLowerCase() || null;

  const fieldErrors = {};
  if (await findByPhone(phone)) fieldErrors.phone = 'That phone number is already registered. Log in instead?';
  if (email && (await User.findOne({ where: { email } })))
    fieldErrors.email = 'That email is already registered. Log in instead?';
  if (Object.keys(fieldErrors).length) {
    throw new ConflictError('CONFLICT', fieldErrors.phone ?? fieldErrors.email, fieldErrors);
  }

  const passwordHash = await hashPassword(password);
  const { otp, code, expiresInSec } = await withTransaction(async (transaction) => {
    const user = await User.create(
      { role, firstName: firstName.trim(), lastName: lastName.trim(), email, phone, passwordHash },
      { transaction },
    );
    if (role === 'vendor') await Vendor.create({ ownerUserId: user.id }, { transaction });
    if (role === 'rider') await Rider.create({ userId: user.id }, { transaction });
    return issueOtp({ identifier: phone, purpose: 'verify' }, { transaction });
  });

  // The account exists now; if the SMS can't be queued the user taps "resend" (otp/request)
  await sendOtp({ to: phone, code, purpose: 'verify' }).catch((err) =>
    logger.error({ err, phone }, 'Could not queue the sign-up OTP'),
  );
  return { otpRequestId: otp.id, phone, expiresInSec };
};

/** POST /auth/login: email + password. */
export const login = async ({ email, password }, context) => {
  const user = await User.scope('withPassword').findOne({ where: { email: email.trim().toLowerCase() } });
  // checkPassword runs even without a user so both failures take the same time
  const valid = await checkPassword(password, user?.passwordHash);
  if (!user || !user.passwordHash || !valid) throw new UnauthenticatedError('INVALID_CREDENTIALS');
  assertNotBlocked(user);
  return startSession(user, context);
};

/** POST /auth/otp/request: login (existing account) or verify (after sign-up / resend). */
export const requestOtp = async ({ phone: rawPhone, purpose = 'login' }) => {
  if (purpose === 'reset') throw new BadRequestError('Use "Forgot password" to get a reset code.');
  const phone = normalisePhone(rawPhone);
  if (!phone) throw new ValidationError({ phone: PHONE_INVALID });

  const user = await findByPhone(phone);
  if (!user) throw new ValidationError({ phone: 'No account uses this number. Sign up instead?' });
  assertNotBlocked(user);

  const { otp, code, expiresInSec } = await issueOtp({ identifier: phone, purpose });
  await sendOtp({ to: phone, code, purpose });
  return { otpRequestId: otp.id, phone, expiresInSec };
};

/** POST /auth/otp/verify: checks a login / verify code and signs in. */
export const verifyOtp = async ({ phone: rawPhone, code, purpose }, context) => {
  const phone = normalisePhone(rawPhone);
  if (!phone) throw new ValidationError({ phone: PHONE_INVALID });
  const user = await findByPhone(phone);
  if (!user) throw new ValidationError({ code: 'That code has expired. Request a new one.' });

  const purposes = purpose && purpose !== 'reset' ? [purpose] : ['login', 'verify'];
  await consumeOtp({ identifier: phone, purposes, code });
  assertNotBlocked(user);

  // Any accepted SMS code proves the phone
  if (!user.phoneVerifiedAt) await user.update({ phoneVerifiedAt: new Date() });
  return startSession(user, context);
};

/**
 * POST /auth/google: signs in the account linked to this Google id or email, or creates a
 * customer (FR-ACC-05).
 */
export const googleSignIn = async ({ credential }, context) => {
  const profile = await google.verifyIdToken(credential);

  let user = await User.findOne({ where: { googleId: profile.googleId } });
  if (!user && profile.email && profile.emailVerified) {
    user = await User.findOne({ where: { email: profile.email } });
    // Link the Google id to the existing account with the same verified email
    if (user) await user.update({ googleId: profile.googleId, emailVerifiedAt: user.emailVerifiedAt ?? new Date() });
  }
  if (!user) {
    user = await User.create({
      role: 'customer',
      firstName: profile.firstName.slice(0, 60),
      lastName: profile.lastName.slice(0, 60) || 'User',
      email: profile.emailVerified ? profile.email : null,
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl,
      emailVerifiedAt: profile.emailVerified ? new Date() : null,
    });
  }

  assertNotBlocked(user);
  return startSession(user, context);
};

const RESET_EXPIRES_IN_SEC = 600;

/** POST /auth/password/forgot: the same answer whether or not the account exists. */
export const forgotPassword = async ({ identifier }) => {
  const user = await findByIdentifier(identifier);
  if (user && user.status !== 'banned') {
    const byEmail = String(identifier).includes('@');
    const to = byEmail ? user.email : user.phone;
    const { code } = await issueOtp({ identifier: to, purpose: 'reset' });
    await sendOtp({ to, code, purpose: 'reset', channel: byEmail ? 'email' : 'sms' });
  }
  return { sent: true, expiresInSec: RESET_EXPIRES_IN_SEC };
};

/** POST /auth/password/reset: code + new password; signs the account out everywhere. */
export const resetPassword = async ({ identifier, code, password }) => {
  const wrong = "That code isn't right or has expired.";
  const user = await findByIdentifier(identifier);
  if (!user) throw new ValidationError({ code: wrong });

  const byEmail = String(identifier).includes('@');
  await consumeOtp({ identifier: byEmail ? user.email : user.phone, purposes: ['reset'], code, wrongMessage: wrong });

  const passwordHash = await hashPassword(password);
  await withTransaction(async (transaction) => {
    await user.update({ passwordHash }, { transaction });
    await endAllSessions(user.id, 'password_reset', { transaction });
  });
  return { reset: true };
};
