import { randomInt } from 'node:crypto';
import { Op } from 'sequelize';
import { env } from '../../config/env.js';
import { hashToken, sameHash } from '../../core/auth/index.js';
import { ValidationError } from '../../core/errors/index.js';
import { models } from '../../db/index.js';

const { OtpCode } = models;

export const OTP_TTL_SEC = { login: 300, verify: 300, reset: 600, phone_change: 300 };
const MAX_ATTEMPTS = 5;

// Real random codes only in production; elsewhere every code is the demo OTP (123456)
const generateCode = () =>
  env.NODE_ENV === 'production' ? String(randomInt(1_000_000)).padStart(6, '0') : env.DEMO_OTP;

/**
 * Creates a code for `identifier` (E.164 phone or email). Earlier unused codes for the same
 * purpose stop working. Returns { otp, code, expiresInSec }; the caller sends `code`.
 */
export const issueOtp = async ({ identifier, purpose, ttlSec }, { transaction } = {}) => {
  await OtpCode.update({ consumedAt: new Date() }, { where: { identifier, purpose, consumedAt: null }, transaction });
  const code = generateCode();
  const expiresInSec = ttlSec ?? OTP_TTL_SEC[purpose];
  const otp = await OtpCode.create(
    { identifier, purpose, codeHash: hashToken(code), expiresAt: new Date(Date.now() + expiresInSec * 1000) },
    { transaction },
  );
  return { otp, code, expiresInSec };
};

const EXPIRED = 'That code has expired. Request a new one.';

/**
 * Checks and uses up a code. Wrong guesses count even when the caller's transaction rolls back
 * (this runs outside it), and after 5 the code stops working. Throws 422 with fieldErrors.code.
 */
export const consumeOtp = async ({ identifier, purposes, code, wrongMessage }) => {
  const otp = await OtpCode.findOne({
    where: { identifier, purpose: purposes, consumedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['createdAt', 'DESC']],
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) throw new ValidationError({ code: EXPIRED });

  if (!sameHash(otp.codeHash, hashToken(String(code ?? '')))) {
    await otp.increment('attempts');
    throw new ValidationError({ code: wrongMessage ?? "That code isn't right. Check the SMS and try again." });
  }

  // Conditional update: two requests racing with the same code can't both succeed
  const [used] = await OtpCode.update({ consumedAt: new Date() }, { where: { id: otp.id, consumedAt: null } });
  if (!used) throw new ValidationError({ code: EXPIRED });
  return otp;
};
