import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { redis, redisPrefix } from '../../config/redis.js';
import { ValidationError } from '../../core/errors/index.js';
import { models, sequelize } from '../../db/index.js';
import { paystack } from '../../integrations/paystack/paystack.client.js';

const { Bank } = models;

// Production asks Paystack; elsewhere the seeded list and a fake lookup (plan, phase 9).
// A function so tests can switch it.
export const bankMode = { live: () => env.NODE_ENV === 'production' };

const FRESH_KEY = `${redisPrefix}:banks:fresh`;
const REFRESH_EVERY_SEC = 24 * 60 * 60;

/** Copies Paystack's bank list into `banks` (banks it no longer lists are deactivated). */
export const refreshBanks = async () => {
  const banks = await paystack.listBanks();
  await sequelize.transaction(async (transaction) => {
    await Bank.update({ isActive: false }, { where: {}, transaction });
    await Bank.bulkCreate(
      banks.map((b) => ({ ...b, isActive: true })),
      { updateOnDuplicate: ['name', 'isActive', 'updatedAt'], transaction },
    );
  });
  await redis.set(FRESH_KEY, '1', 'EX', REFRESH_EVERY_SEC).catch(() => {});
  return banks.length;
};

/** GET /banks: [{ code, name }] by name. In production the list is refreshed at most once a day. */
export const listBanks = async () => {
  if (bankMode.live() && !(await redis.get(FRESH_KEY).catch(() => null))) {
    // A Paystack outage serves yesterday's list rather than failing the form
    await refreshBanks().catch((err) => logger.error({ err }, 'Bank list refresh failed; serving the stored list'));
  }
  const banks = await Bank.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
  return banks.map(({ code, name }) => ({ code, name }));
};

const NOT_FOUND = "We couldn't find that account. Check the number and the bank.";

/** POST /banks/resolve: { bankCode, bankName, accountNumber, accountName } or 422. */
export const resolveAccount = async (user, { bankCode, accountNumber }) => {
  const bank = await Bank.findOne({ where: { code: bankCode, isActive: true } });
  if (!bank) throw new ValidationError({ bankCode: 'Pick your bank' });

  // Locally: the user's own name in capitals; numbers ending 0000 are "not found" (as the mock)
  const accountName = bankMode.live()
    ? await paystack.resolveAccount({ bankCode, accountNumber })
    : accountNumber.endsWith('0000')
      ? null
      : user.name.toUpperCase();
  if (!accountName) throw new ValidationError({ accountNumber: NOT_FOUND });

  return { bankCode, bankName: bank.name, accountNumber, accountName };
};
