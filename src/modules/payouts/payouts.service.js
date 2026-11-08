// Rider money (BR-PAY-06): completed trips, this month's earnings, and monthly payout statements
// (draft → approved → paid) that finance approves and marks paid. Reference: foodie-fe
// src/mocks/handlers/riders.js (trips, earnings, statements) and admin-ops.js (payouts).
import { Op, fn, col, literal, where } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { lagosDay, lagosDayStart } from '../../core/utils/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { notify } from '../notifications/notifications.service.js';
import { getSettings } from '../settings/settings.service.js';

const { Delivery, Order, Rider, RiderPayoutStatement, User } = models;

const iso = (date) => (date ? new Date(date).toISOString() : null);
const naira = (kobo) => `₦${(kobo / 100).toLocaleString('en-NG')}`;

// ── Lagos months ─────────────────────────────────────────────────────────────

/** `YYYY-MM` of the Lagos month `date` falls in. */
export const lagosMonth = (date = new Date()) => lagosDay(date).slice(0, 7);

/** The month before `month` (`YYYY-MM`). */
export const previousMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const nextMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** [start, end) of a Lagos month as UTC Dates. */
const monthRange = (month) => [lagosDayStart(`${month}-01`), lagosDayStart(`${nextMonth(month)}-01`)];

const ownRider = async (user) => {
  const rider = await Rider.findOne({ where: { userId: user.id } });
  if (!rider) throw new NotFoundError();
  if (rider.approvalStatus !== 'approved') throw new ConflictError('NOT_APPROVED', 'Your account is not approved yet.');
  return rider;
};

// ── Rider: trips and earnings ────────────────────────────────────────────────

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
// JSON text has a binary collation on MySQL; LOWER on both sides keeps the search case-insensitive
const dropoffArea = literal("LOWER(JSON_UNQUOTE(JSON_EXTRACT(`order`.`address`, '$.area')))");

// GET /rider/trips (handoff section 3): search order code, vendor, drop-off area; newest first
const TRIPS = {
  dateField: 'deliveredAt',
  defaultSort: '-deliveredAt',
  sortable: { deliveredAt: 'deliveredAt', fee: 'fee', earning: 'riderEarning', distanceM: 'distanceM' },
  include: [{ model: Order, as: 'order', attributes: ['id', 'code', 'vendorName', 'address'] }],
};

/** GET /rider/trips: the rider's delivered trips. */
export const listTrips = async (user, query) => {
  const rider = await ownRider(user);
  const listQuery = buildListQuery(query, TRIPS, { scope: { riderId: rider.id, status: 'delivered' } });
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    listQuery.where = {
      [Op.and]: [
        listQuery.where,
        {
          [Op.or]: [
            { '$order.code$': { [Op.like]: pattern } },
            { '$order.vendor_name$': { [Op.like]: pattern } },
            where(dropoffArea, Op.like, pattern.toLowerCase()),
          ],
        },
      ],
    };
  }
  const { data, meta } = await paginate(Delivery, listQuery);
  return {
    data: data.map((d) => ({
      id: d.id,
      orderId: d.orderId,
      orderCode: d.order?.code ?? '',
      vendorName: d.order?.vendorName ?? d.pickup?.name ?? '',
      dropoffArea: d.order?.address?.area ?? '',
      distanceM: d.distanceM,
      fee: d.fee,
      earning: d.riderEarning,
      deliveredAt: iso(d.deliveredAt),
    })),
    meta,
  };
};

/** Trips, fees and earnings of the rider's deliveries delivered in [from, to). */
const totals = async (riderId, from, to) => {
  const [row] = await Delivery.findAll({
    where: { riderId, status: 'delivered', deliveredAt: { [Op.gte]: from, [Op.lt]: to } },
    attributes: [
      [fn('COUNT', col('id')), 'trips'],
      [fn('COALESCE', fn('SUM', col('fee')), 0), 'fees'],
      [fn('COALESCE', fn('SUM', col('rider_earning')), 0), 'earnings'],
    ],
    raw: true,
  });
  return { trips: Number(row.trips), deliveryFees: Number(row.fees), earnings: Number(row.earnings) };
};

/** GET /rider/earnings: this Lagos month's trips, fees and earnings, and today's. */
export const earnings = async (user) => {
  const rider = await ownRider(user);
  const now = new Date();
  const month = lagosMonth(now);
  const today = lagosDay(now);
  const [start, end] = monthRange(month);
  const todayStart = lagosDayStart(today);
  const [thisMonth, todays, settings] = await Promise.all([
    totals(rider.id, start, end),
    totals(rider.id, todayStart, new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)),
    getSettings(),
  ]);
  return {
    month,
    payoutPct: settings.riderPayoutPct,
    ...thisMonth,
    today: { trips: todays.trips, earnings: todays.earnings },
  };
};

// ── Statements ───────────────────────────────────────────────────────────────

/** A statement as the rider sees it. */
export const toStatementDto = (s) => ({
  id: s.id,
  month: s.month,
  trips: s.trips,
  deliveryFees: s.deliveryFees,
  payoutPct: s.payoutPct,
  amount: s.amount,
  adjustments: s.adjustments,
  status: s.status,
  reference: s.reference,
  approvedAt: iso(s.approvedAt),
  paidAt: iso(s.paidAt),
  createdAt: iso(s.createdAt),
});

/** GET /rider/statements: newest month first. */
export const listStatements = async (user) => {
  const rider = await ownRider(user);
  const rows = await RiderPayoutStatement.findAll({ where: { riderId: rider.id }, order: [['month', 'DESC']] });
  return rows.map(toStatementDto);
};

/** Admin row: the statement plus who it is for and who approved it. */
const toAdminStatementDto = (s) => ({
  ...toStatementDto(s),
  riderId: s.riderId,
  riderName: s.rider?.user?.name ?? '',
  approvedBy: s.approver?.name ?? null,
});

const ADMIN_INCLUDE = [
  {
    model: Rider,
    as: 'rider',
    attributes: ['id', 'userId'],
    include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
  },
  { model: User, as: 'approver', attributes: ['id', 'firstName', 'lastName'] },
];

// GET /admin/payouts (handoff section 3): search rider name, reference; filter status, month
const ADMIN_LIST = {
  searchFields: ['reference', '$rider.user.first_name$', '$rider.user.last_name$'],
  filters: { status: 'status', month: 'month', riderId: 'riderId' },
  defaultSort: '-month',
  sortable: { month: 'month', amount: 'amount', trips: 'trips', status: 'status', createdAt: 'createdAt' },
  include: ADMIN_INCLUDE,
};

export const listPayouts = async (query) => {
  const listQuery = buildListQuery(query, ADMIN_LIST);
  // Same month: biggest first, so the list is stable
  listQuery.order = [...listQuery.order, ['amount', 'DESC'], ['id', 'ASC']];
  const { data, meta } = await paginate(RiderPayoutStatement, listQuery);
  return { data: data.map(toAdminStatementDto), meta };
};

const loadStatement = (id, transaction) => RiderPayoutStatement.findByPk(id, { include: ADMIN_INCLUDE, transaction });

/** POST /admin/payouts/{id}/approve: draft → approved (409 otherwise), audited. */
export const approvePayout = async (actor, id, req) => {
  await withTransaction(async (transaction) => {
    const statement = await lockForUpdate(RiderPayoutStatement, id, transaction, {
      message: "We couldn't find that statement.",
    });
    if (statement.status !== 'draft') {
      throw new ConflictError('INVALID_STATUS', 'Only draft statements can be approved.');
    }
    await statement.update({ status: 'approved', approvedAt: new Date(), approvedBy: actor.id }, { transaction });
    const full = await loadStatement(id, transaction);
    await audit.log(
      {
        actor,
        action: 'payout.approved',
        targetType: 'payout',
        targetId: id,
        summary: `${full.rider?.user?.name ?? 'Rider'} ${full.month}: ${naira(full.amount)}`,
        req,
      },
      { transaction },
    );
  });
  return toAdminStatementDto(await loadStatement(id));
};

/**
 * POST /admin/payouts/{id}/mark-paid `{ reference }`: approved → paid with the bank transfer
 * reference (409 if not approved, 422 without a reference); the rider is told. Audited.
 */
export const markPayoutPaid = async (actor, id, { reference }, req) => {
  const ref = String(reference ?? '').trim();
  await withTransaction(async (transaction) => {
    const statement = await lockForUpdate(RiderPayoutStatement, id, transaction, {
      message: "We couldn't find that statement.",
    });
    if (statement.status !== 'approved') {
      throw new ConflictError('INVALID_STATUS', 'Approve the statement before you mark it paid.');
    }
    if (ref.length < 4 || ref.length > 60)
      throw new ValidationError({ reference: 'Enter the bank transfer reference' });
    await statement.update({ status: 'paid', paidAt: new Date(), reference: ref }, { transaction });
    const full = await loadStatement(id, transaction);
    await notify(
      full.rider?.userId,
      {
        type: 'payout',
        title: 'Your payout has been sent',
        body: `${naira(full.amount)} for ${full.month}. Reference ${ref}.`,
        link: '/rider/earnings',
      },
      { transaction },
    );
    await audit.log(
      {
        actor,
        action: 'payout.marked_paid',
        targetType: 'payout',
        targetId: id,
        summary: `${full.rider?.user?.name ?? 'Rider'} ${full.month}: ${naira(full.amount)} (${ref})`,
        req,
      },
      { transaction },
    );
  });
  return toAdminStatementDto(await loadStatement(id));
};

/**
 * Job `payouts:payouts.statements` (1st of each month, Lagos): a draft statement per rider who
 * delivered in `month` (default: last month). Amount = the earnings fixed on each delivery.
 * Idempotent: (rider, month) is unique, so a re-run adds nothing.
 */
export const generateStatements = async ({ month = previousMonth(lagosMonth()) } = {}) => {
  const [start, end] = monthRange(month);
  const settings = await getSettings();
  const rows = await Delivery.findAll({
    where: { status: 'delivered', deliveredAt: { [Op.gte]: start, [Op.lt]: end } },
    attributes: [
      'riderId',
      [fn('COUNT', col('id')), 'trips'],
      [fn('SUM', col('fee')), 'fees'],
      [fn('SUM', col('rider_earning')), 'earnings'],
    ],
    group: ['riderId'],
    raw: true,
  });
  if (!rows.length) return { month, created: 0 };
  const before = await RiderPayoutStatement.count({ where: { month } });
  await RiderPayoutStatement.bulkCreate(
    rows.map((r) => ({
      riderId: r.riderId,
      month,
      trips: Number(r.trips),
      deliveryFees: Number(r.fees),
      payoutPct: settings.riderPayoutPct,
      amount: Number(r.earnings),
      adjustments: 0,
      status: 'draft',
    })),
    { ignoreDuplicates: true },
  );
  const created = (await RiderPayoutStatement.count({ where: { month } })) - before;
  return { month, created };
};
