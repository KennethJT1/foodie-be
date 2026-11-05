// Settlement and reconciliation sweeps (BR-PAY-08), run by the scheduler.
import { Op } from 'sequelize';
import { models } from '../../db/index.js';
import { paystackMode } from '../../integrations/paystack/paystack.client.js';

const { Payment, PaymentEvent } = models;
const HOUR = 60 * 60 * 1000;

// Paystack pays the vendor's share out on T+1; we show "settled" a day and a half after payment
const SETTLE_AFTER_MS = 36 * HOUR;

/** `payments.settle` (hourly): settling → settled once the settlement window has passed. */
export const settlePayments = async (now = new Date()) => {
  const [settled] = await Payment.update(
    { settlementStatus: 'settled', settledAt: now },
    {
      where: {
        status: 'success',
        settlementStatus: 'settling',
        paidAt: { [Op.lte]: new Date(now.getTime() - SETTLE_AFTER_MS) },
      },
    },
  );
  return { settled };
};

/**
 * `payments.reconcile` (hourly): a successful payment Paystack never sent `charge.success` for an
 * hour later is flagged `missing_webhook` for finance. Only meaningful with Paystack live.
 */
export const reconcilePayments = async (now = new Date()) => {
  if (!paystackMode.live()) return { flagged: 0 };
  const candidates = await Payment.findAll({
    where: {
      status: 'success',
      flag: null,
      reconciled: false,
      paidAt: { [Op.lte]: new Date(now.getTime() - HOUR), [Op.gte]: new Date(now.getTime() - 48 * HOUR) },
    },
    attributes: ['id', 'reference'],
  });
  if (!candidates.length) return { flagged: 0 };
  const seen = new Set(
    (
      await PaymentEvent.findAll({
        where: { eventType: 'charge.success', reference: candidates.map((p) => p.reference) },
        attributes: ['reference'],
      })
    ).map((e) => e.reference),
  );
  const missing = candidates.filter((p) => !seen.has(p.reference)).map((p) => p.id);
  if (missing.length) await Payment.update({ flag: 'missing_webhook' }, { where: { id: missing } });
  // Payments that did get their webhook are reconciled
  const ok = candidates.filter((p) => seen.has(p.reference)).map((p) => p.id);
  if (ok.length) await Payment.update({ reconciled: true }, { where: { id: ok } });
  return { flagged: missing.length, reconciled: ok.length };
};
