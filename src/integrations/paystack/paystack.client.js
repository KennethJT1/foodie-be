import { env } from '../../config/env.js';

/** A Paystack API call failed; `status` is Paystack's HTTP status (0 when unreachable). */
export class PaystackError extends Error {
  constructor(status, message) {
    super(`Paystack ${status}: ${message}`);
    this.name = 'PaystackError';
    this.status = status;
  }
}

const call = async (method, path, { query, body } = {}) => {
  if (!env.PAYSTACK_SECRET_KEY) throw new PaystackError(0, 'PAYSTACK_SECRET_KEY is not set');
  const url = new URL(path, env.PAYSTACK_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new PaystackError(0, err.message);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) throw new PaystackError(res.status, json.message ?? 'request failed');
  return json;
};

/** Paystack API (https://paystack.com/docs/api). An object so tests can replace methods. */
export const paystack = {
  /** Every active Nigerian NGN bank: [{ code, name }]. Follows Paystack's cursor pages. */
  async listBanks() {
    const banks = [];
    let next;
    do {
      const page = await call('GET', '/bank', {
        query: { country: 'nigeria', currency: 'NGN', use_cursor: 'true', perPage: '100', ...(next && { next }) },
      });
      banks.push(...page.data.filter((b) => b.active && !b.is_deleted).map((b) => ({ code: b.code, name: b.name })));
      next = page.meta?.next;
    } while (next);
    return banks;
  },

  /** The account holder's name, or null when Paystack can't find the account. */
  async resolveAccount({ bankCode, accountNumber }) {
    try {
      const { data } = await call('GET', '/bank/resolve', {
        query: { account_number: accountNumber, bank_code: bankCode },
      });
      return data.account_name;
    } catch (err) {
      // Paystack answers 422 (sometimes 400) for an account that doesn't exist
      if (err.status === 422 || err.status === 400) return null;
      throw err;
    }
  },

  /** Split-payment subaccount for a vendor (phase 10). Returns the subaccount code. */
  async createSubaccount({ businessName, bankCode, accountNumber, percentageCharge, email }) {
    const { data } = await call('POST', '/subaccount', {
      body: {
        business_name: businessName,
        settlement_bank: bankCode,
        account_number: accountNumber,
        percentage_charge: percentageCharge,
        primary_contact_email: email,
      },
    });
    return data.subaccount_code;
  },
};
