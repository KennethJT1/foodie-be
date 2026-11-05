// Admin customers and payments (BR-PAY-08 reconciliation). Reference: foodie-fe
// src/mocks/handlers/admin.js (customers) and admin-ops.js (payments).
import { col, fn, literal, Op } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { models, withTransaction } from '../../db/index.js';

const { Order, Payment, User, Vendor } = models;

// ── Customers ────────────────────────────────────────────────────────────────

const ORDERS_COUNT = literal('(SELECT COUNT(*) FROM `orders` AS `o` WHERE `o`.`customer_id` = `User`.`id`)');

// GET /admin/customers (handoff section 3): search name, email, phone; filter status
const CUSTOMER_LIST = {
  searchFields: ['firstName', 'lastName', 'email', 'phone'],
  filters: { status: 'status' },
  defaultSort: '-createdAt',
  sortable: {
    createdAt: 'createdAt',
    name: [['firstName'], ['lastName']],
    status: 'status',
    ordersCount: (direction) => [ORDERS_COUNT, direction],
  },
};

export const listCustomers = async (query) => {
  const { data, meta } = await paginate(User, buildListQuery(query, CUSTOMER_LIST, { scope: { role: 'customer' } }), {
    attributes: { include: [[ORDERS_COUNT, 'ordersCount']] },
  });
  return {
    data: data.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      ordersCount: Number(u.get('ordersCount') ?? 0),
      createdAt: u.createdAt.toISOString(),
    })),
    meta,
  };
};

/** POST /admin/customers/{id}/status: suspend or ban (reason required) or restore; audited. */
export const setCustomerStatus = async (actor, id, { status, reason }, req) =>
  withTransaction(async (transaction) => {
    const customer = await User.findOne({
      where: { id, role: 'customer' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!customer) throw new NotFoundError("We couldn't find that customer.");
    const why = String(reason ?? '').trim();
    if (status !== 'active' && !why) throw new ValidationError({ reason: 'Give a reason' });
    await customer.update({ status }, { transaction });
    await audit.log(
      {
        actor,
        action: `customer.${status}`,
        targetType: 'user',
        targetId: customer.id,
        summary: `${customer.name} set to ${status}${why ? `: ${why}` : ''}`,
        req,
      },
      { transaction },
    );
    // Blocked accounts are refused on their next request (authenticate re-reads the user)
    return { id: customer.id, status };
  });

// ── Payments ─────────────────────────────────────────────────────────────────

const PAYMENT_INCLUDE = [
  { model: Vendor, as: 'vendor', attributes: ['id', 'name'], paranoid: false },
  { model: Order, as: 'order', attributes: ['id', 'code'] },
];

// GET /admin/payments (handoff section 3): search reference, vendor, order code
const PAYMENT_LIST = {
  searchFields: ['reference', '$vendor.name$', '$order.code$'],
  filters: {
    type: 'type',
    status: 'status',
    settlementStatus: 'settlementStatus',
    channel: 'channel',
    flagged: ([value]) => (value === 'true' ? { flag: { [Op.ne]: null } } : undefined),
  },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', amount: 'amount', status: 'status' },
  include: PAYMENT_INCLUDE,
};

const toPaymentRow = (p) => ({
  id: p.id,
  reference: p.reference,
  type: p.type,
  orderId: p.orderId,
  orderCode: p.order?.code ?? null,
  vendorId: p.vendorId,
  vendorName: p.vendor?.name ?? '',
  amount: p.amount,
  vendorShare: p.vendorShare,
  platformShare: p.platformShare,
  fee: p.fee,
  channel: p.channel,
  status: p.status,
  settlementStatus: p.settlementStatus,
  reconciled: p.reconciled,
  flag: p.flag,
  createdAt: p.createdAt.toISOString(),
});

/** GET /admin/payments; meta.summary over the filtered range (successful payments). */
export const listPayments = async (query) => {
  const listQuery = buildListQuery(query, PAYMENT_LIST);
  // Unpaid checkouts are not transactions yet
  listQuery.where = { [Op.and]: [listQuery.where, { status: { [Op.ne]: 'pending' } }] };
  const { data, meta } = await paginate(Payment, listQuery);
  const include = PAYMENT_INCLUDE.map((i) => ({ ...i, attributes: [] }));
  const [sums] = await Payment.findAll({
    where: { [Op.and]: [listQuery.where, { status: 'success' }] },
    include,
    attributes: [
      [fn('SUM', col('amount')), 'amount'],
      [fn('SUM', col('vendor_share')), 'vendorShare'],
      [fn('SUM', col('platform_share')), 'platformShare'],
      [fn('SUM', col('fee')), 'fee'],
    ],
    raw: true,
  });
  const flagged = await Payment.count({ where: { [Op.and]: [listQuery.where, { flag: { [Op.ne]: null } }] }, include });
  const n = (v) => Number(v ?? 0);
  return {
    data: data.map(toPaymentRow),
    meta: {
      ...meta,
      summary: {
        amount: n(sums?.amount),
        vendorShare: n(sums?.vendorShare),
        platformShare: n(sums?.platformShare),
        fee: n(sums?.fee),
        flagged,
      },
    },
  };
};

/** POST /admin/payments/{id}/reconcile: clears the flag with a note on how it was checked. */
export const reconcilePayment = async (actor, id, { note }, req) =>
  withTransaction(async (transaction) => {
    const payment = await Payment.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!payment) throw new NotFoundError("We couldn't find that payment.");
    const flag = payment.flag;
    await payment.update({ flag: null, reconciled: true, reconcileNote: note }, { transaction });
    await audit.log(
      {
        actor,
        action: 'payment.reconciled',
        targetType: 'payment',
        targetId: payment.id,
        summary: `${payment.reference}: cleared ${flag ?? 'flag'} (${note})`,
        req,
      },
      { transaction },
    );
    return { id: payment.id, flag: null, reconciled: true };
  });
