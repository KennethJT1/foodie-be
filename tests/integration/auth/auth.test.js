import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { hashToken } from '../../../src/core/auth/index.js';
import { getQueue } from '../../../src/core/queue/index.js';
import { models } from '../../../src/db/index.js';
import { google } from '../../../src/integrations/google/google.client.js';
import { resetDatabase } from '../../helpers/db.js';
import { PASSWORD, createUser } from '../../helpers/factories.js';

const { User, Vendor, Rider, RefreshToken, OtpCode } = models;
const realVerify = google.verifyIdToken;

const cookieFrom = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('kjt_refresh='));
const cookieValue = (res) => cookieFrom(res)?.split(';')[0].split('=')[1];
const withCookie = (value) => `kjt_refresh=${value}`;

const expectError = (res, status, code) => {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(false);
  expect(res.body.error.code).toBe(code);
};

const expectSession = (res) => {
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual({
    accessToken: expect.any(String),
    user: expect.objectContaining({ id: expect.any(String) }),
  });
  const cookie = cookieFrom(res);
  expect(cookie).toMatch(/HttpOnly/);
  expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  expect(cookie).toMatch(/SameSite=Lax/);
  expect(cookie).toMatch(/Max-Age=2592000/);
  return res.body.data;
};

beforeEach(() => resetDatabase());
afterAll(() => {
  google.verifyIdToken = realVerify;
});

describe('POST /auth/register', () => {
  const body = {
    role: 'customer',
    firstName: 'Ngozi',
    lastName: 'Eze',
    email: 'Ngozi@Example.com',
    phone: '0803 123 4567',
    password: 'jollof123',
  };

  it('creates a customer, normalises phone and email, and sends a verify OTP', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ otpRequestId: expect.any(String), phone: '+2348031234567', expiresInSec: 300 });

    const user = await User.scope('withPassword').findOne({ where: { phone: '+2348031234567' } });
    expect(user).toMatchObject({
      role: 'customer',
      email: 'ngozi@example.com',
      status: 'active',
      phoneVerifiedAt: null,
    });
    expect(user.passwordHash).not.toBe('jollof123');

    const otp = await OtpCode.findByPk(res.body.data.otpRequestId);
    expect(otp).toMatchObject({ identifier: '+2348031234567', purpose: 'verify' });
    const jobs = await getQueue('notifications').getJobs(['waiting', 'delayed', 'active', 'completed']);
    expect(
      jobs.some((j) => j.name === 'sms.send' && j.data.to === '+2348031234567' && j.data.text.includes('123456')),
    ).toBe(true);
  });

  it.each([
    ['vendor', Vendor, 'ownerUserId'],
    ['rider', Rider, 'userId'],
  ])('a %s also gets a draft profile', async (role, Model, key) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...body, role });
    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { phone: '+2348031234567' } });
    expect(await Model.findOne({ where: { [key]: user.id } })).toMatchObject({ approvalStatus: 'draft' });
  });

  it('refuses admin sign-ups', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...body, role: 'admin' });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.fieldErrors.role).toBe('Pick how you want to use KJT Foodie.');
  });

  it('409s on a registered phone or email, naming the field', async () => {
    await createUser({ phone: '+2348031234567', email: 'ngozi@example.com' });
    const res = await request(app).post('/api/v1/auth/register').send(body);
    expectError(res, 409, 'CONFLICT');
    expect(res.body.error.message).toBe('That phone number is already registered. Log in instead?');
    expect(res.body.error.fieldErrors).toEqual({
      phone: 'That phone number is already registered. Log in instead?',
      email: 'That email is already registered. Log in instead?',
    });
  });

  it('422s with field errors', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ role: 'customer', phone: '12345', password: 'short' });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(res.body.error.fieldErrors).toMatchObject({
      firstName: 'Enter your first name',
      lastName: 'Enter your last name',
      password: 'Use at least 8 characters',
    });

    const badPhone = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...body, phone: '12345' });
    expect(badPhone.body.error.fieldErrors).toEqual({ phone: 'Enter a valid Nigerian phone number' });
  });
});

describe('OTP sign-in', () => {
  it('request → verify signs in and marks the phone verified', async () => {
    const user = await createUser({ phone: '+2348039990001' });
    const sent = await request(app).post('/api/v1/auth/otp/request').send({ phone: '08039990001', purpose: 'login' });
    expect(sent.status).toBe(200);
    expect(sent.body.data).toMatchObject({ phone: '+2348039990001', expiresInSec: 300 });

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+2348039990001', code: '123456', purpose: 'login' });
    expect(expectSession(res).user).toMatchObject({ id: user.id, phoneVerified: true });
  });

  it('after sign-up, the verify code starts the session', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ role: 'rider', firstName: 'Ike', lastName: 'Obi', phone: '08039990002', password: 'password1' });
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '08039990002', code: '123456', purpose: 'verify' });
    expect(expectSession(res).user).toMatchObject({
      role: 'rider',
      rider: { approvalStatus: 'draft', isOnline: false, id: expect.any(String) },
    });
  });

  it('wrong code → 422 on code; five wrong tries use the code up', async () => {
    await createUser({ phone: '+2348039990003' });
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+2348039990003' });

    const wrong = await request(app).post('/api/v1/auth/otp/verify').send({ phone: '+2348039990003', code: '000000' });
    expectError(wrong, 422, 'VALIDATION_ERROR');
    expect(wrong.body.error.fieldErrors.code).toBe("That code isn't right. Check the SMS and try again.");

    await OtpCode.update({ attempts: 5 }, { where: { identifier: '+2348039990003' } });
    const locked = await request(app).post('/api/v1/auth/otp/verify').send({ phone: '+2348039990003', code: '123456' });
    expect(locked.body.error.fieldErrors.code).toBe('That code has expired. Request a new one.');
  });

  it('a code works once', async () => {
    await createUser({ phone: '+2348039990004' });
    await request(app).post('/api/v1/auth/otp/request').send({ phone: '+2348039990004' });
    expect(
      (await request(app).post('/api/v1/auth/otp/verify').send({ phone: '+2348039990004', code: '123456' })).status,
    ).toBe(200);
    expectError(
      await request(app).post('/api/v1/auth/otp/verify').send({ phone: '+2348039990004', code: '123456' }),
      422,
      'VALIDATION_ERROR',
    );
  });

  it('unknown number → 422 suggesting sign-up', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone: '+2348039990099' });
    expect(res.body.error.fieldErrors.phone).toBe('No account uses this number. Sign up instead?');
  });

  it('banned / suspended accounts get 403', async () => {
    await createUser({ phone: '+2348039990005', status: 'suspended' });
    expectError(
      await request(app).post('/api/v1/auth/otp/request').send({ phone: '+2348039990005' }),
      403,
      'ACCOUNT_SUSPENDED',
    );
  });
});

describe('POST /auth/login', () => {
  it('signs in with email + password (any case)', async () => {
    const user = await createUser({
      email: 'bisi@kjtfoodie.test',
      role: 'vendor',
      vendor: { name: 'Mama Put Kitchen', slug: 'mama-put-kitchen' },
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ' BISI@kjtfoodie.test ', password: PASSWORD });
    const { user: dto } = expectSession(res);
    expect(dto).toMatchObject({
      id: user.id,
      role: 'vendor',
      permissions: [],
      vendor: {
        name: 'Mama Put Kitchen',
        slug: 'mama-put-kitchen',
        approvalStatus: 'draft',
        subscriptionStatus: 'none',
        onboardingStep: 'type',
        planId: null,
        logo: null,
      },
    });
    expect(dto).not.toHaveProperty('passwordHash');
    expect((await User.findByPk(user.id)).lastLoginAt).not.toBeNull();
  });

  it('wrong password or unknown email → 401 INVALID_CREDENTIALS', async () => {
    await createUser({ email: 'ada@kjtfoodie.test' });
    for (const body of [
      { email: 'ada@kjtfoodie.test', password: 'wrong-password' },
      { email: 'nobody@kjtfoodie.test', password: PASSWORD },
    ]) {
      const res = await request(app).post('/api/v1/auth/login').send(body);
      expectError(res, 401, 'INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('That email or password is wrong. Try again or reset your password.');
    }
  });

  it.each([
    ['banned', 'ACCOUNT_BANNED'],
    ['suspended', 'ACCOUNT_SUSPENDED'],
  ])('%s → 403 %s, no cookie', async (status, code) => {
    await createUser({ email: `${status}@kjtfoodie.test`, status });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `${status}@kjtfoodie.test`, password: PASSWORD });
    expectError(res, 403, code);
    expect(cookieFrom(res)).toBeUndefined();
  });
});

describe('refresh and logout', () => {
  const signIn = async () => {
    await createUser({ email: 'tunde@kjtfoodie.test', role: 'rider' });
    return request(app).post('/api/v1/auth/login').send({ email: 'tunde@kjtfoodie.test', password: PASSWORD });
  };

  it('rotates the cookie and returns a session', async () => {
    const first = cookieValue(await signIn());
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(first));
    expectSession(res);
    const second = cookieValue(res);
    expect(second).not.toBe(first);

    const old = await RefreshToken.findOne({ where: { tokenHash: hashToken(first) } });
    const next = await RefreshToken.findOne({ where: { tokenHash: hashToken(second) } });
    expect(old).toMatchObject({ revokedReason: 'rotated' });
    expect(next.familyId).toBe(old.familyId);
  });

  it('no or unknown cookie → 401 and the cookie is cleared', async () => {
    expectError(await request(app).post('/api/v1/auth/refresh'), 401, 'UNAUTHENTICATED');
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie('made-up'));
    expectError(res, 401, 'UNAUTHENTICATED');
    expect(cookieFrom(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('replaying an old token after the grace window revokes the whole family', async () => {
    const first = cookieValue(await signIn());
    const second = cookieValue(await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(first)));
    // Pretend the rotation happened a minute ago
    await RefreshToken.update({ revokedAt: new Date(Date.now() - 60_000) }, { where: { tokenHash: hashToken(first) } });

    expectError(
      await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(first)),
      401,
      'UNAUTHENTICATED',
    );
    // The legitimate newer token is dead too
    expectError(
      await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(second)),
      401,
      'UNAUTHENTICATED',
    );
    expect(await RefreshToken.count({ where: { revokedReason: 'reuse' } })).toBe(1);
  });

  it('two tabs refreshing with the same cookie within the grace window both succeed', async () => {
    const first = cookieValue(await signIn());
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(first))).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(first))).status).toBe(200);
  });

  it('a user banned since sign-in gets 403 on refresh', async () => {
    const cookie = cookieValue(await signIn());
    await User.update({ status: 'banned' }, { where: { email: 'tunde@kjtfoodie.test' } });
    expectError(
      await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(cookie)),
      403,
      'ACCOUNT_BANNED',
    );
  });

  it('logout → 204, cookie cleared, refresh no longer works', async () => {
    const cookie = cookieValue(await signIn());
    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', withCookie(cookie));
    expect(res.status).toBe(204);
    expect(cookieFrom(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expectError(
      await request(app).post('/api/v1/auth/refresh').set('Cookie', withCookie(cookie)),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('logout without a cookie is still 204', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(204);
  });
});

describe('POST /auth/google', () => {
  const profile = {
    googleId: 'g-123',
    email: 'amaka@gmail.com',
    emailVerified: true,
    firstName: 'Amaka',
    lastName: 'Obi',
    avatarUrl: 'https://lh3.googleusercontent.com/a/x',
  };

  it('creates a customer for a new Google account', async () => {
    google.verifyIdToken = async () => profile;
    const { user } = expectSession(
      await request(app).post('/api/v1/auth/google').send({ credential: 'google-id-token' }),
    );
    expect(user).toMatchObject({
      role: 'customer',
      firstName: 'Amaka',
      email: 'amaka@gmail.com',
      phone: null,
      avatar: profile.avatarUrl,
    });
  });

  it('links an existing account with the same verified email', async () => {
    const existing = await createUser({ email: 'amaka@gmail.com', role: 'vendor' });
    google.verifyIdToken = async () => profile;
    const { user } = expectSession(
      await request(app).post('/api/v1/auth/google').send({ credential: 'google-id-token' }),
    );
    expect(user.id).toBe(existing.id);
    expect((await User.findByPk(existing.id)).googleId).toBe('g-123');
  });

  it('an invalid token → 401', async () => {
    google.verifyIdToken = realVerify;
    expectError(
      await request(app).post('/api/v1/auth/google').send({ credential: 'not-a-real-google-token' }),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('a banned account → 403', async () => {
    await createUser({ email: 'amaka@gmail.com', googleId: 'g-123', status: 'banned' });
    google.verifyIdToken = async () => profile;
    expectError(
      await request(app).post('/api/v1/auth/google').send({ credential: 'google-id-token' }),
      403,
      'ACCOUNT_BANNED',
    );
  });
});

describe('password reset', () => {
  it('forgot always answers the same', async () => {
    for (const identifier of ['nobody@kjtfoodie.test', '08030000999']) {
      const res = await request(app).post('/api/v1/auth/password/forgot').send({ identifier });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ sent: true, expiresInSec: 600 });
    }
  });

  it('reset by phone code sets the new password and signs out everywhere', async () => {
    await createUser({ email: 'kemi@kjtfoodie.test', phone: '+2348039990010' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'kemi@kjtfoodie.test', password: PASSWORD });
    await request(app).post('/api/v1/auth/password/forgot').send({ identifier: '0803 999 0010' });

    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ identifier: '08039990010', code: '123456', password: 'new-password-1' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ reset: true });

    expect(
      (await request(app).post('/api/v1/auth/login').send({ email: 'kemi@kjtfoodie.test', password: 'new-password-1' }))
        .status,
    ).toBe(200);
    expectError(
      await request(app).post('/api/v1/auth/login').send({ email: 'kemi@kjtfoodie.test', password: PASSWORD }),
      401,
      'INVALID_CREDENTIALS',
    );
    expectError(
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', withCookie(cookieValue(login))),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('reset by email code works too', async () => {
    await createUser({ email: 'musa@kjtfoodie.test' });
    await request(app).post('/api/v1/auth/password/forgot').send({ identifier: 'MUSA@kjtfoodie.test' });
    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ identifier: 'musa@kjtfoodie.test', code: '123456', password: 'new-password-1' });
    expect(res.status).toBe(200);
  });

  it('wrong code → 422 on code; short password → 422 on password', async () => {
    await createUser({ phone: '+2348039990011' });
    await request(app).post('/api/v1/auth/password/forgot').send({ identifier: '+2348039990011' });
    const wrong = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ identifier: '+2348039990011', code: '999999', password: 'new-password-1' });
    expect(wrong.body.error.fieldErrors).toEqual({ code: "That code isn't right or has expired." });
    const short = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ identifier: '+2348039990011', code: '123456', password: 'short' });
    expect(short.body.error.fieldErrors).toEqual({ password: 'Use at least 8 characters' });
  });
});
