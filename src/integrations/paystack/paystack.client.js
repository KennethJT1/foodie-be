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

/**
 * Whether money calls (subaccounts, transactions) go to Paystack: whenever a secret key is set,
 * except in automated tests. Development uses the test keys (Paystack test mode); without a key,
 * callers fall back to a local stand-in like the frontend mock. A function so tests can switch it.
 */
export const paystackMode = { live: () => Boolean(env.PAYSTACK_SECRET_KEY) && env.NODE_ENV !== 'test' };

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

  /** Starts a transaction for the Paystack popup: { accessCode, authorizationUrl }. Amount in kobo. */
  async initializeTransaction({ email, amount, reference, metadata, subaccount, transactionCharge }) {
    const { data } = await call('POST', '/transaction/initialize', {
      body: {
        email,
        amount,
        reference,
        metadata,
        currency: 'NGN',
        ...(subaccount && { subaccount, transaction_charge: transactionCharge, bearer: 'account' }),
      },
    });
    return { accessCode: data.access_code, authorizationUrl: data.authorization_url };
  },

  /** What Paystack knows about a transaction (never trust the client or the webhook alone). */
  async verifyTransaction(reference) {
    const { data } = await call('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    return toTransaction(data);
  },

  /** Full refund of a transaction (rejected / cancelled orders). */
  async refund({ reference }) {
    const { data } = await call('POST', '/refund', { body: { transaction: reference } });
    return { id: data.id, status: data.status };
  },

  /** Charges a saved card (renewals). Returns the transaction; `status` may be failed. */
  async chargeAuthorization({ authorizationCode, email, amount, reference, metadata }) {
    const { data } = await call('POST', '/transaction/charge_authorization', {
      body: { authorization_code: authorizationCode, email, amount, reference, metadata, currency: 'NGN' },
    });
    return toTransaction(data);
  },
};

/** Paystack transaction → the fields we use. `status`: success, failed, abandoned, ongoing... */
const toTransaction = (data) => ({
  reference: data.reference,
  status: data.status,
  amount: data.amount,
  currency: data.currency,
  channel: data.channel ?? null,
  fee: data.fees ?? 0,
  paidAt: data.paid_at ? new Date(data.paid_at) : null,
  authorizationCode: data.authorization?.reusable ? data.authorization.authorization_code : null,
  email: data.customer?.email ?? null,
});
