import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { audit } from '../../../src/core/audit/index.js';
import { models } from '../../../src/db/index.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

let admin;
let auth;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser({
    role: 'admin',
    adminRole: 'super_admin',
    firstName: 'Kenneth',
    lastName: 'Taiwo',
    phone: null,
  });
  auth = bearer(admin);
});

const entries = async (query = '') =>
  (await request(app).get(`/api/v1/admin/audit-log${query}`).set('Authorization', auth)).body;

describe('GET /admin/audit-log', () => {
  it('lists entries newest first in the contract shape, with search, filters and dates', async () => {
    const at = (iso) => ({ createdAt: new Date(iso) });
    await models.AuditLog.bulkCreate([
      {
        actorId: admin.id,
        actorName: 'Kenneth Taiwo',
        actorRole: 'super_admin',
        action: 'vendor.approve',
        targetType: 'vendor',
        targetId: 'ven_mama_put',
        summary: 'Approved Mama Put',
        ip: '10.0.0.1',
        ...at('2026-10-20T10:00:00Z'),
      },
      {
        actorId: null,
        actorName: 'System',
        actorRole: 'system',
        action: 'payment.reconciled',
        targetType: 'payment',
        targetId: 'pay_1',
        summary: 'Matched Paystack charge',
        ...at('2026-10-25T10:00:00Z'),
      },
      {
        actorId: admin.id,
        actorName: 'Ifeoma Nwosu',
        actorRole: 'support',
        action: 'vendor.reject',
        targetType: 'vendor',
        targetId: 'ven_new',
        summary: 'Rejected: unreadable CAC',
        ...at('2026-10-27T10:00:00Z'),
      },
    ]);

    const all = await entries();
    expect(all.data.map((e) => e.action)).toEqual(['vendor.reject', 'payment.reconciled', 'vendor.approve']);
    expect(all.data[2]).toEqual({
      id: expect.any(String),
      actorName: 'Kenneth Taiwo',
      actorRole: 'super_admin',
      action: 'vendor.approve',
      targetType: 'vendor',
      targetId: 'ven_mama_put',
      summary: 'Approved Mama Put',
      ip: '10.0.0.1',
      createdAt: '2026-10-20T10:00:00.000Z',
    });
    expect(all.meta).toMatchObject({ total: 3 });

    expect((await entries('?action=vendor')).data.map((e) => e.action)).toEqual(['vendor.reject', 'vendor.approve']);
    expect((await entries('?action=payment.,vendor.approve')).data).toHaveLength(2);
    expect((await entries('?actorRole=system')).data.map((e) => e.targetId)).toEqual(['pay_1']);
    expect((await entries('?targetType=vendor&search=mama')).data.map((e) => e.targetId)).toEqual(['ven_mama_put']);
    expect((await entries('?search=ifeoma')).data).toHaveLength(1);
    expect((await entries('?search=ven_new')).data).toHaveLength(1);
    expect((await entries('?from=2026-10-24&to=2026-10-26')).data.map((e) => e.targetId)).toEqual(['pay_1']);
    expect((await entries('?sort=createdAt')).data[0].action).toBe('vendor.approve');
  });

  it('audit.log without an actor records the system', async () => {
    await audit.log({
      actor: null,
      action: 'subscription.extended',
      targetType: 'subscription',
      targetId: 7,
      summary: 'x',
    });
    const [entry] = (await entries()).data;
    expect(entry).toMatchObject({ actorName: 'System', actorRole: 'system', targetId: '7', ip: null });
  });
});

describe('phase 7 actions are audited', () => {
  it('admin_user.created / updated and role.updated / reset, with actor and ip', async () => {
    const created = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', auth)
      .send({ firstName: 'Zainab', lastName: 'Bello', email: 'zainab@kjtfoodie.test', adminRole: 'support' });
    await request(app)
      .patch(`/api/v1/admin/users/${created.body.data.id}`)
      .set('Authorization', auth)
      .send({ adminRole: 'finance', status: 'suspended' })
      .expect(200);
    await request(app)
      .patch('/api/v1/admin/roles/dispatch')
      .set('Authorization', auth)
      .send({ permissions: ['dashboard.view', 'orders.view', 'refunds.view'] })
      .expect(200);
    await request(app).post('/api/v1/admin/roles/dispatch/reset').set('Authorization', auth).expect(200);

    const log = (await entries('?sort=createdAt')).data;
    expect(log.map(({ action, targetType, targetId, summary }) => ({ action, targetType, targetId, summary }))).toEqual(
      [
        {
          action: 'admin_user.created',
          targetType: 'user',
          targetId: created.body.data.id,
          summary: 'Zainab Bello added as support',
        },
        {
          action: 'admin_user.updated',
          targetType: 'user',
          targetId: created.body.data.id,
          summary: 'Zainab Bello: finance, suspended',
        },
        {
          action: 'role.updated',
          targetType: 'role',
          targetId: 'dispatch',
          summary: 'dispatch: +refunds.view −riders.view, orders.reassign, live_map.view',
        },
        { action: 'role.reset', targetType: 'role', targetId: 'dispatch', summary: 'dispatch back to defaults' },
      ],
    );
    for (const entry of log) expect(entry).toMatchObject({ actorName: 'Kenneth Taiwo', actorRole: 'super_admin' });
    expect(log[0].ip).toEqual(expect.any(String));
  });

  it('a refused change writes nothing', async () => {
    await request(app)
      .patch('/api/v1/admin/roles/super_admin')
      .set('Authorization', auth)
      .send({ permissions: ['dashboard.view'] })
      .expect(409);
    expect((await entries()).data).toEqual([]);
  });
});
