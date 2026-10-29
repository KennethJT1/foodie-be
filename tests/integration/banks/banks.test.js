import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { redis, redisPrefix } from '../../../src/config/redis.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { paystack } from '../../../src/integrations/paystack/paystack.client.js';
import { bankMode } from '../../../src/modules/banks/banks.service.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

const real = { ...paystack, live: bankMode.live };
let user;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await redis.del(`${redisPrefix}:banks:fresh`);
  user = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
});
afterEach(() => {
  Object.assign(paystack, { listBanks: real.listBanks, resolveAccount: real.resolveAccount });
  bankMode.live = real.live;
});

const resolve = (body, who = user) =>
  request(app).post('/api/v1/banks/resolve').set('Authorization', bearer(who)).send(body);

describe('GET /banks', () => {
  it('is public and lists the seeded banks by name', async () => {
    const res = await request(app).get('/api/v1/banks');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
    expect(res.body.data[0]).toEqual({ code: '044', name: 'Access Bank' });
    expect(res.body.data.map((b) => b.name)).toEqual([...res.body.data.map((b) => b.name)].sort());
  });

  it('live: refreshes from Paystack once a day, deactivates dropped banks, survives an outage', async () => {
    bankMode.live = () => true;
    let calls = 0;
    paystack.listBanks = async () => {
      calls += 1;
      return [
        { code: '044', name: 'Access Bank Plc' },
        { code: '100004', name: 'Palmpay' },
      ];
    };
    const first = await request(app).get('/api/v1/banks');
    expect(first.body.data).toEqual([
      { code: '044', name: 'Access Bank Plc' },
      { code: '100004', name: 'Palmpay' },
    ]);
    await request(app).get('/api/v1/banks').expect(200);
    expect(calls).toBe(1);
    expect(await models.Bank.findByPk('058')).toMatchObject({ isActive: false });

    await redis.del(`${redisPrefix}:banks:fresh`);
    paystack.listBanks = async () => {
      throw new Error('Paystack is down');
    };
    expect((await request(app).get('/api/v1/banks')).body.data).toHaveLength(2);
  });
});

describe('POST /banks/resolve', () => {
  it('locally: the user name in capitals; numbers ending 0000 are not found', async () => {
    const res = await resolve({ bankCode: '058', accountNumber: '0123456789' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      accountNumber: '0123456789',
      accountName: 'ADA OKAFOR',
    });
    const missing = await resolve({ bankCode: '058', accountNumber: '0123450000' });
    expect(missing.status).toBe(422);
    expect(missing.body.error.fieldErrors).toEqual({
      accountNumber: "We couldn't find that account. Check the number and the bank.",
    });
  });

  it('live: asks Paystack', async () => {
    bankMode.live = () => true;
    paystack.resolveAccount = async ({ bankCode, accountNumber }) =>
      bankCode === '057' && accountNumber === '1234567890' ? 'MAMA PUT KITCHEN LTD' : null;
    expect((await resolve({ bankCode: '057', accountNumber: '1234567890' })).body.data.accountName).toBe(
      'MAMA PUT KITCHEN LTD',
    );
    expect((await resolve({ bankCode: '057', accountNumber: '1234567891' })).status).toBe(422);
  });

  it('422 for a bad number or unknown bank; 401 signed out', async () => {
    expect((await resolve({ bankCode: '058', accountNumber: '12345' })).body.error.fieldErrors).toEqual({
      accountNumber: 'Enter the 10-digit account number',
    });
    expect((await resolve({ accountNumber: '0123456789' })).body.error.fieldErrors).toEqual({
      bankCode: 'Pick your bank',
    });
    expect((await resolve({ bankCode: '999', accountNumber: '0123456789' })).body.error.fieldErrors).toEqual({
      bankCode: 'Pick your bank',
    });
    expect((await request(app).post('/api/v1/banks/resolve').send({})).status).toBe(401);
  });
});
