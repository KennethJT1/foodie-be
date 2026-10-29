import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { getQueue } from '../../../src/core/queue/index.js';
import { models } from '../../../src/db/index.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

const { User, OtpCode } = models;

let superAdmin;
let auth;

beforeEach(async () => {
  await resetDatabase();
  superAdmin = await createUser({
    role: 'admin',
    adminRole: 'super_admin',
    firstName: 'Kenneth',
    lastName: 'Taiwo',
    phone: null,
  });
  auth = bearer(superAdmin);
});

describe('GET /admin/users', () => {
  it('lists only admins, sorted by name, with search and filters', async () => {
    await createUser({ role: 'admin', adminRole: 'support', firstName: 'Ifeoma', lastName: 'Nwosu', phone: null });
    await createUser({
      role: 'admin',
      adminRole: 'finance',
      firstName: 'Musa',
      lastName: 'Abdullahi',
      phone: null,
      status: 'suspended',
    });
    await createUser({ firstName: 'Ada', lastName: 'Okafor' });

    const res = await request(app).get('/api/v1/admin/users').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.name)).toEqual(['Ifeoma Nwosu', 'Kenneth Taiwo', 'Musa Abdullahi']);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      name: 'Ifeoma Nwosu',
      email: expect.any(String),
      adminRole: 'support',
      status: 'active',
      createdAt: expect.any(String),
    });
    expect(res.body.meta).toMatchObject({ total: 3, page: 1 });

    const filtered = await request(app)
      .get('/api/v1/admin/users?adminRole=finance,support&status=active')
      .set('Authorization', auth);
    expect(filtered.body.data.map((u) => u.name)).toEqual(['Ifeoma Nwosu']);
    const searched = await request(app).get('/api/v1/admin/users?search=abdul').set('Authorization', auth);
    expect(searched.body.data.map((u) => u.name)).toEqual(['Musa Abdullahi']);
  });
});

describe('POST /admin/users', () => {
  it('creates an admin without a password and emails a set-password code', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', auth)
      .send({ firstName: 'Zainab', lastName: 'Bello', email: 'Zainab@KJTFoodie.test', adminRole: 'onboarding' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Zainab Bello',
      email: 'zainab@kjtfoodie.test',
      adminRole: 'onboarding',
      status: 'active',
    });

    const created = await User.scope('withPassword').findByPk(res.body.data.id);
    expect(created).toMatchObject({ role: 'admin', passwordHash: null });
    const otp = await OtpCode.findOne({ where: { identifier: 'zainab@kjtfoodie.test', purpose: 'reset' } });
    expect(otp.expiresAt.getTime() - Date.now()).toBeGreaterThan(70 * 60 * 60 * 1000);

    const jobs = await getQueue('notifications').getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
    const email = jobs.find((j) => j.name === 'email.send' && j.data.to === 'zainab@kjtfoodie.test');
    expect(email.data.text).toMatch(/reset-password\?identifier=zainab%40kjtfoodie.test/);

    // The invite works like a password reset
    const reset = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ identifier: 'zainab@kjtfoodie.test', code: '123456', password: 'new-password-1' });
    expect(reset.status).toBe(200);
    await email.remove().catch(() => {});
  });

  it('422 for bad fields and an email already in use', async () => {
    await createUser({ email: 'taken@kjtfoodie.test' });
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', auth)
      .send({ firstName: 'Z', lastName: '', email: 'nope', adminRole: 'boss' });
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors).toEqual({
      firstName: 'Enter their first name',
      lastName: 'Enter their last name',
      email: 'Enter a valid email address',
      adminRole: 'Pick a role',
    });
    const taken = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', auth)
      .send({ firstName: 'Zainab', lastName: 'Bello', email: 'taken@kjtfoodie.test', adminRole: 'support' });
    expect(taken.body.error.fieldErrors).toEqual({ email: 'That email already has an account' });
  });
});

describe('PATCH /admin/users/{id}', () => {
  it("changes another admin's role and suspends them (blocked at once)", async () => {
    const support = await createUser({ role: 'admin', adminRole: 'support', phone: null });
    const supportAuth = bearer(support);
    const res = await request(app)
      .patch(`/api/v1/admin/users/${support.id}`)
      .set('Authorization', auth)
      .send({ adminRole: 'finance' });
    expect(res.body.data).toMatchObject({ adminRole: 'finance', status: 'active' });
    expect((await request(app).get('/api/v1/me').set('Authorization', supportAuth)).body.data.permissions).toContain(
      'payments.view',
    );

    await request(app)
      .patch(`/api/v1/admin/users/${support.id}`)
      .set('Authorization', auth)
      .send({ status: 'suspended' })
      .expect(200);
    const blocked = await request(app).get('/api/v1/me').set('Authorization', supportAuth);
    expect(blocked.body.error.code).toBe('ACCOUNT_SUSPENDED');

    await request(app)
      .patch(`/api/v1/admin/users/${support.id}`)
      .set('Authorization', auth)
      .send({ status: 'active' })
      .expect(200);
    expect((await request(app).get('/api/v1/me').set('Authorization', supportAuth)).status).toBe(200);
  });

  it('409 for yourself; 404 for a non-admin or a missing id; 422 for a bad role', async () => {
    const self = await request(app)
      .patch(`/api/v1/admin/users/${superAdmin.id}`)
      .set('Authorization', auth)
      .send({ status: 'suspended' });
    expect(self.status).toBe(409);
    expect(self.body.error.message).toBe("You can't change your own role or access.");

    const customer = await createUser();
    expect(
      (
        await request(app)
          .patch(`/api/v1/admin/users/${customer.id}`)
          .set('Authorization', auth)
          .send({ status: 'suspended' })
      ).status,
    ).toBe(404);
    expect((await request(app).patch('/api/v1/admin/users/nope').set('Authorization', auth).send({})).status).toBe(404);
    const bad = await request(app)
      .patch(`/api/v1/admin/users/${customer.id}`)
      .set('Authorization', auth)
      .send({ adminRole: 'boss', status: 'banned' });
    expect(bad.body.error.fieldErrors).toEqual({ adminRole: 'Pick a role', status: 'Pick a status' });
  });
});
