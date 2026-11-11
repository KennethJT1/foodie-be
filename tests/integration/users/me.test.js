import { beforeEach, describe, expect, it } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../../src/app.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../../../src/core/auth/index.js';
import { getQueue } from '../../../src/core/queue/index.js';
import { models } from '../../../src/db/index.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

const { User, Address, RefreshToken, OtpCode } = models;

beforeEach(() => resetDatabase());

describe('authenticate', () => {
  it.each([
    ['no header', undefined],
    ['not Bearer', 'Basic abc'],
    ['garbage token', 'Bearer abc.def.ghi'],
    [
      'wrong secret',
      `Bearer ${jwt.sign({ sub: 'x' }, 'not-our-secret-at-all-not-our-secret', { issuer: 'kjt-foodie-api' })}`,
    ],
  ])('%s → 401', async (_, header) => {
    const req = request(app).get('/api/v1/me');
    const res = await (header ? req.set('Authorization', header) : req);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED', message: 'Please log in to continue.' });
  });

  it('an expired token → 401', async () => {
    const user = await createUser();
    const token = jwt.sign({ sub: user.id }, process.env.JWT_ACCESS_SECRET, {
      issuer: 'kjt-foodie-api',
      expiresIn: -10,
    });
    expect((await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('a user banned after sign-in is blocked at once', async () => {
    const user = await createUser();
    const header = bearer(user);
    await user.update({ status: 'banned' });
    const res = await request(app).get('/api/v1/me').set('Authorization', header);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_BANNED');
  });
});

describe('GET /me', () => {
  it('returns a customer', async () => {
    const user = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
    const res = await request(app).get('/api/v1/me').set('Authorization', bearer(user));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: user.id,
      role: 'customer',
      permissions: [],
      firstName: 'Ada',
      lastName: 'Okafor',
      name: 'Ada Okafor',
      email: user.email,
      phone: user.phone,
      avatar: null,
      status: 'active',
      phoneVerified: false,
      createdAt: expect.any(String),
    });
  });

  it('returns fresh vendor details', async () => {
    const user = await createUser({ role: 'vendor' });
    await models.Vendor.update(
      { approvalStatus: 'approved', subscriptionStatus: 'trial' },
      { where: { ownerUserId: user.id } },
    );
    const res = await request(app).get('/api/v1/me').set('Authorization', bearer(user));
    expect(res.body.data.vendor).toMatchObject({ approvalStatus: 'approved', subscriptionStatus: 'trial' });
  });

  it.each(Object.keys(DEFAULT_ROLE_PERMISSIONS))('an admin (%s) gets adminRole and permissions', async (adminRole) => {
    const user = await createUser({ role: 'admin', adminRole, phone: null });
    const res = await request(app).get('/api/v1/me').set('Authorization', bearer(user));
    expect(res.body.data).toMatchObject({
      role: 'admin',
      adminRole,
      permissions: [...DEFAULT_ROLE_PERMISSIONS[adminRole]],
    });
    if (adminRole === 'super_admin') expect(res.body.data.permissions).toEqual([...PERMISSIONS]);
  });
});

describe('PATCH /me', () => {
  it('updates only the fields sent', async () => {
    const user = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', bearer(user))
      .send({ lastName: ' Nwosu ', email: 'Ada.New@kjtfoodie.test' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      firstName: 'Ada',
      lastName: 'Nwosu',
      name: 'Ada Nwosu',
      email: 'ada.new@kjtfoodie.test',
    });
  });

  it("409 when the email is someone else's", async () => {
    await createUser({ email: 'taken@kjtfoodie.test' });
    const user = await createUser();
    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', bearer(user))
      .send({ email: 'taken@kjtfoodie.test' });
    expect(res.status).toBe(409);
    expect(res.body.error.fieldErrors).toEqual({ email: 'That email is already used by another account.' });
  });

  it('422 for an empty name or a bad email', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', bearer(user))
      .send({ firstName: ' ', email: 'nope' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fieldErrors).sort()).toEqual(['email', 'firstName']);
  });
});

describe('DELETE /me', () => {
  it('anonymises the customer, removes addresses and sessions, and 401s afterwards', async () => {
    const user = await createUser({ email: 'gone@kjtfoodie.test' });
    await Address.create({
      userId: user.id,
      line1: '1 Herbert Macaulay Way',
      area: 'Yaba',
      city: 'Lagos',
      lat: 6.5,
      lng: 3.37,
    });
    await RefreshToken.create({
      userId: user.id,
      tokenHash: 'a'.repeat(64),
      familyId: 'f1',
      expiresAt: new Date(Date.now() + 1e9),
    });
    const header = bearer(user);

    const res = await request(app).delete('/api/v1/me').set('Authorization', header);
    expect(res.status).toBe(204);

    const row = await User.findByPk(user.id, { paranoid: false });
    expect(row).toMatchObject({ firstName: 'Deleted', lastName: 'user', email: null, phone: null });
    expect(row.deletedAt).not.toBeNull();
    expect(await Address.count({ where: { userId: user.id } })).toBe(0);
    expect((await RefreshToken.findOne({ where: { userId: user.id } })).revokedReason).toBe('deleted');
    expect((await request(app).get('/api/v1/me').set('Authorization', header)).status).toBe(401);
  });

  it('vendors, riders and admins get 403', async () => {
    const vendor = await createUser({ role: 'vendor' });
    const res = await request(app).delete('/api/v1/me').set('Authorization', bearer(vendor));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('changing the phone number (/me/phone)', () => {
  const NEW = '+2348091112233';
  const smsTo = async (to) =>
    (await getQueue('notifications').getJobs(['waiting', 'delayed', 'active', 'completed'])).filter(
      (j) => j.name === 'sms.send' && j.data.to === to,
    );
  const requestCode = (user, phone = '0809 111 2233') =>
    request(app).post('/api/v1/me/phone/otp').set('Authorization', bearer(user)).send({ phone });
  const verify = (user, code = '123456', phone = NEW) =>
    request(app).post('/api/v1/me/phone/verify').set('Authorization', bearer(user)).send({ phone, code });

  it('sends a code to the new number, and saves it as verified once the code is checked', async () => {
    const user = await createUser();
    const oldPhone = user.phone;

    const sent = await requestCode(user);
    expect(sent.status).toBe(200);
    expect(sent.body.data).toEqual({ otpRequestId: expect.any(String), phone: NEW, expiresInSec: 300 });
    expect(await OtpCode.findByPk(sent.body.data.otpRequestId)).toMatchObject({
      identifier: `${user.id}:${NEW}`,
      purpose: 'phone_change',
    });
    expect((await smsTo(NEW)).some((j) => j.data.text.includes('123456'))).toBe(true);
    // Not saved until the code comes back
    expect((await user.reload()).phone).toBe(oldPhone);

    const res = await verify(user);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ phone: NEW, phoneVerified: true });
    expect((await user.reload()).phone).toBe(NEW);
    expect((await smsTo(oldPhone)).some((j) => j.data.text.includes('ending in 2233'))).toBe(true);
  });

  it('lets an account with no phone (Google sign-up) add one', async () => {
    const user = await createUser({ phone: null });
    expect((await requestCode(user)).status).toBe(200);
    const res = await verify(user);
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe(NEW);
  });

  it('rejects a wrong code and leaves the number alone', async () => {
    const user = await createUser();
    await requestCode(user);
    const res = await verify(user, '000000');
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors.code).toMatch(/isn't right/);
    expect((await user.reload()).phone).not.toBe(NEW);
  });

  it("won't accept a code sent for a different number or another account", async () => {
    const user = await createUser();
    const other = await createUser();
    await requestCode(other);
    expect((await verify(user)).status).toBe(422);

    await requestCode(user);
    expect((await verify(user, '123456', '+2348091112244')).status).toBe(422);
  });

  it.each([
    ['an invalid number', '12345', 422, /valid Nigerian/],
    ['your current number', null, 422, /already your phone number/],
  ])('rejects %s', async (_, phone, status, message) => {
    const user = await createUser();
    const res = await requestCode(user, phone ?? user.phone);
    expect(res.status).toBe(status);
    expect(res.body.error.fieldErrors.phone).toMatch(message);
  });

  it("rejects a number another account uses, even if it's taken after the code was sent", async () => {
    const user = await createUser();
    const taken = await createUser();
    const res = await requestCode(user, taken.phone);
    expect(res.status).toBe(409);
    expect(res.body.error.fieldErrors.phone).toMatch(/already used by another account/);

    await requestCode(user);
    await createUser({ phone: NEW });
    expect((await verify(user)).status).toBe(409);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).post('/api/v1/me/phone/otp').send({ phone: NEW })).status).toBe(401);
  });
});
