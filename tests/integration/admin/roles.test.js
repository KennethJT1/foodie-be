import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../../../src/core/auth/index.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

let auth;
let support;

beforeEach(async () => {
  await resetDatabase();
  auth = bearer(await createUser({ role: 'admin', adminRole: 'super_admin', phone: null }));
  support = await createUser({ role: 'admin', adminRole: 'support', phone: null });
});

describe('admin roles', () => {
  it('GET lists the five roles and every permission', async () => {
    const res = await request(app).get('/api/v1/admin/roles').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toEqual([...PERMISSIONS]);
    expect(res.body.data.roles.map((r) => r.id)).toEqual([
      'super_admin',
      'support',
      'finance',
      'dispatch',
      'onboarding',
    ]);
    for (const role of res.body.data.roles) {
      expect([...role.permissions].sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS[role.id]].sort());
    }
  });

  it('PATCH changes what the role can do at once (cache invalidated), reset restores it', async () => {
    const supportAuth = bearer(support);
    // support can't manage admins by default
    expect((await request(app).get('/api/v1/admin/users').set('Authorization', supportAuth)).status).toBe(403);

    const res = await request(app)
      .patch('/api/v1/admin/roles/support')
      .set('Authorization', auth)
      .send({ permissions: ['dashboard.view', 'admin_users.manage', 'admin_users.manage'] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: 'support',
      name: 'Support',
      permissions: ['dashboard.view', 'admin_users.manage'],
    });
    expect((await request(app).get('/api/v1/admin/users').set('Authorization', supportAuth)).status).toBe(200);
    expect((await request(app).get('/api/v1/me').set('Authorization', supportAuth)).body.data.permissions).toEqual([
      'dashboard.view',
      'admin_users.manage',
    ]);

    const reset = await request(app).post('/api/v1/admin/roles/support/reset').set('Authorization', auth);
    expect([...reset.body.data.permissions].sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS.support].sort());
    expect((await request(app).get('/api/v1/admin/users').set('Authorization', supportAuth)).status).toBe(403);
  });

  it('super_admin is locked (409); dashboard.view is required and unknown permissions refused (422); unknown role 404', async () => {
    const locked = await request(app)
      .patch('/api/v1/admin/roles/super_admin')
      .set('Authorization', auth)
      .send({ permissions: ['dashboard.view'] });
    expect(locked.status).toBe(409);
    expect(locked.body.error.message).toBe('The super admin role always has every permission.');

    const noDashboard = await request(app)
      .patch('/api/v1/admin/roles/finance')
      .set('Authorization', auth)
      .send({ permissions: ['payments.view'] });
    expect(noDashboard.body.error.fieldErrors).toEqual({ permissions: 'Every role needs the overview' });
    const unknown = await request(app)
      .patch('/api/v1/admin/roles/finance')
      .set('Authorization', auth)
      .send({ permissions: ['dashboard.view', 'nuke.everything'] });
    expect(unknown.body.error.fieldErrors).toEqual({ permissions: 'Pick permissions from the list' });

    expect(
      (
        await request(app)
          .patch('/api/v1/admin/roles/chef')
          .set('Authorization', auth)
          .send({ permissions: ['dashboard.view'] })
      ).status,
    ).toBe(404);
    expect((await request(app).post('/api/v1/admin/roles/chef/reset').set('Authorization', auth)).status).toBe(404);
  });
});
