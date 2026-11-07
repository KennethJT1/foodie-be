import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { lagosDayStart } from '../../../src/core/utils/index.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { generateStatements, lagosMonth, previousMonth } from '../../../src/modules/payouts/payouts.service.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createOrderRow, createPublicVendor, createUser } from '../../helpers/factories.js';

const { AuditLog, Notification, Rider, RiderPayoutStatement } = models;

let ada;
let vendor;
let tunde;
let tundeRider;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  ({ vendor } = await createPublicVendor({ vendor: { name: 'Mama Put Kitchen' } }));
  tunde = await createUser({
    role: 'rider',
    firstName: 'Tunde',
    lastName: 'Bakare',
    rider: { approvalStatus: 'approved' },
  });
  tundeRider = await Rider.findOne({ where: { userId: tunde.id } });
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

const trip = (deliveredAt, overrides = {}) =>
  createOrderRow({ customer: ada, vendor, rider: tundeRider, deliveredAt, ...overrides });

const thisMonth = lagosMonth();
const lastMonth = previousMonth(thisMonth);
/** Noon (Lagos) on `day` of `month`. */
const on = (month, day) =>
  new Date(lagosDayStart(`${month}-${String(day).padStart(2, '0')}`).getTime() + 12 * 3600_000);

describe('rider trips and earnings', () => {
  it('GET /rider/trips lists delivered trips, newest first, searchable by code, vendor or area', async () => {
    const older = await trip(on(lastMonth, 3));
    const newer = await trip(new Date(), {
      address: {
        label: 'Work',
        line1: '2 Admiralty Way',
        area: 'Lekki',
        city: 'Lagos',
        state: 'Lagos',
        lat: 6.44,
        lng: 3.47,
      },
    });
    await trip(new Date(), { status: 'picked_up' });

    const res = await api('get', '/rider/trips', tunde);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data[0]).toEqual({
      id: newer.delivery.id,
      orderId: newer.id,
      orderCode: newer.code,
      vendorName: 'Mama Put Kitchen',
      dropoffArea: 'Lekki',
      distanceM: 2500,
      fee: 150000,
      earning: 105000,
      deliveredAt: expect.any(String),
    });
    expect(res.body.data[1].id).toBe(older.delivery.id);
    expect((await api('get', '/rider/trips?search=lekki', tunde)).body.data.map((t) => t.orderId)).toEqual([newer.id]);
    expect((await api('get', `/rider/trips?search=${older.code}`, tunde)).body.meta.total).toBe(1);
  });

  it('GET /rider/earnings sums this Lagos month and today', async () => {
    await trip(new Date());
    await trip(new Date(), { deliveryFee: 100000 });
    await trip(on(lastMonth, 10));

    const res = await api('get', '/rider/earnings', tunde);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      month: thisMonth,
      payoutPct: 70,
      trips: 2,
      deliveryFees: 250000,
      earnings: 175000,
      today: { trips: 2, earnings: 175000 },
    });
  });

  it('needs an approved rider (409 NOT_APPROVED) and the rider role (403)', async () => {
    const pending = await createUser({ role: 'rider', rider: { approvalStatus: 'pending' } });
    const res = await api('get', '/rider/earnings', pending);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_APPROVED');
    expect((await api('get', '/rider/trips', ada)).status).toBe(403);
  });
});

describe('monthly statements', () => {
  it('generateStatements makes one draft per rider for last month; running it again adds nothing', async () => {
    await trip(on(lastMonth, 2));
    await trip(on(lastMonth, 20), { deliveryFee: 100000 });
    await trip(new Date());
    const kemiUser = await createUser({ role: 'rider', rider: { approvalStatus: 'approved' } });
    const kemi = await Rider.findOne({ where: { userId: kemiUser.id } });
    await createOrderRow({ customer: ada, vendor, rider: kemi, deliveredAt: on(lastMonth, 5) });

    expect(await generateStatements()).toEqual({ month: lastMonth, created: 2 });
    expect(await generateStatements()).toEqual({ month: lastMonth, created: 0 });
    const statement = await RiderPayoutStatement.findOne({ where: { riderId: tundeRider.id } });
    expect(statement).toMatchObject({
      month: lastMonth,
      trips: 2,
      deliveryFees: 250000,
      payoutPct: 70,
      amount: 175000,
      adjustments: 0,
      status: 'draft',
    });

    const mine = await api('get', '/rider/statements', tunde);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toEqual([
      {
        id: statement.id,
        month: lastMonth,
        trips: 2,
        deliveryFees: 250000,
        payoutPct: 70,
        amount: 175000,
        adjustments: 0,
        status: 'draft',
        reference: null,
        approvedAt: null,
        paidAt: null,
        createdAt: expect.any(String),
      },
    ]);
  });
});

describe('admin payouts', () => {
  const seedStatement = (overrides = {}) =>
    RiderPayoutStatement.create({
      riderId: tundeRider.id,
      month: lastMonth,
      trips: 40,
      deliveryFees: 5_000_000,
      payoutPct: 70,
      amount: 3_500_000,
      ...overrides,
    });

  it('lists statements (search, status and month filters) and approves then marks paid, audited', async () => {
    const statement = await seedStatement();
    await seedStatement({ month: previousMonth(lastMonth), status: 'paid', reference: 'TRF_OLD' });
    const finance = await createUser({
      role: 'admin',
      adminRole: 'finance',
      firstName: 'Fola',
      lastName: 'Finance',
      phone: null,
    });

    const list = await api('get', `/admin/payouts?month=${lastMonth}&status=draft&search=tunde`, finance);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({ id: statement.id, riderId: tundeRider.id, riderName: 'Tunde Bakare', status: 'draft' }),
    ]);
    expect((await api('get', '/admin/payouts', finance)).body.data.map((s) => s.month)).toEqual([
      lastMonth,
      previousMonth(lastMonth),
    ]);

    const early = await api('post', `/admin/payouts/${statement.id}/mark-paid`, finance, { reference: 'TRF_123456' });
    expect(early.status).toBe(409);

    const approved = await api('post', `/admin/payouts/${statement.id}/approve`, finance);
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({
      status: 'approved',
      approvedAt: expect.any(String),
      approvedBy: 'Fola Finance',
    });
    expect((await api('post', `/admin/payouts/${statement.id}/approve`, finance)).status).toBe(409);

    const noRef = await api('post', `/admin/payouts/${statement.id}/mark-paid`, finance, { reference: ' 12 ' });
    expect(noRef.status).toBe(422);
    expect(noRef.body.error.fieldErrors.reference).toBe('Enter the bank transfer reference');

    const paid = await api('post', `/admin/payouts/${statement.id}/mark-paid`, finance, { reference: ' TRF_123456 ' });
    expect(paid.status).toBe(200);
    expect(paid.body.data).toMatchObject({ status: 'paid', reference: 'TRF_123456', paidAt: expect.any(String) });
    expect(
      await Notification.count({ where: { userId: tunde.id, type: 'payout', title: 'Your payout has been sent' } }),
    ).toBe(1);
    const actions = (await AuditLog.findAll({ where: { targetId: statement.id }, order: [['createdAt', 'ASC']] })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(['payout.approved', 'payout.marked_paid']);
  });

  it('404 for an unknown statement; payouts.manage only', async () => {
    const finance = await createUser({ role: 'admin', adminRole: 'finance', phone: null });
    const missing = await api('post', '/admin/payouts/00000000-0000-7000-8000-000000000000/approve', finance);
    expect(missing.status).toBe(404);
    const support = await createUser({ role: 'admin', adminRole: 'support', phone: null });
    expect((await api('get', '/admin/payouts', support)).status).toBe(403);
  });
});
