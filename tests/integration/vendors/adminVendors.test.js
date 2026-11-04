import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { paystack, paystackMode } from '../../../src/integrations/paystack/paystack.client.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUpload, createUser } from '../../helpers/factories.js';

const { Vendor, VendorBankAccount, VendorDocument, BankChangeRequest, AuditLog, Notification } = models;
const real = { createSubaccount: paystack.createSubaccount, live: paystackMode.live };

let admin;
let auth;

/** A vendor at `approvalStatus` with a document and a bank account. */
const makeVendor = async ({ approvalStatus = 'pending', name = 'Mama Put Kitchen', city = 'Lagos', ...rest } = {}) => {
  const owner = await createUser({ role: 'vendor', firstName: 'Bisi', lastName: 'Adeyemi' });
  const vendor = await Vendor.findOne({ where: { ownerUserId: owner.id } });
  await vendor.update({
    name,
    slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${vendor.id.slice(-6)}`,
    type: 'home_cook',
    city,
    approvalStatus,
    submittedAt: new Date(),
    ...rest,
  });
  const upload = await createUpload(owner, 'vendor_document');
  await VendorDocument.create({
    vendorId: vendor.id,
    type: 'government_id',
    label: 'Government ID',
    uploadId: upload.id,
  });
  await VendorBankAccount.create({
    vendorId: vendor.id,
    bankCode: '058',
    bankName: 'Guaranty Trust Bank',
    accountNumber: '0123456789',
    accountName: 'BISI ADEYEMI',
  });
  return { owner, vendor };
};

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  admin = await createUser({ role: 'admin', adminRole: 'onboarding', phone: null });
  auth = bearer(admin);
});
afterEach(() => {
  paystack.createSubaccount = real.createSubaccount;
  paystackMode.live = real.live;
});

const post = (path, body = {}) =>
  request(app).post(`/api/v1/admin/vendors${path}`).set('Authorization', auth).send(body);
const get = (path = '') => request(app).get(`/api/v1/admin/vendors${path}`).set('Authorization', auth);

describe('GET /admin/vendors', () => {
  it('lists everything but drafts, with filters and search on owner and city', async () => {
    await makeVendor({ name: 'Mama Put Kitchen' });
    await makeVendor({ name: 'Suya Spot', approvalStatus: 'approved', city: 'Abuja' });
    await createUser({ role: 'vendor' }); // a draft

    const all = await get();
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0]).toMatchObject({
      ownerName: 'Bisi Adeyemi',
      type: 'home_cook',
      subscriptionStatus: 'none',
      planName: null,
    });

    expect((await get('?approvalStatus=pending')).body.data.map((v) => v.name)).toEqual(['Mama Put Kitchen']);
    expect((await get('?city=Abuja')).body.data.map((v) => v.name)).toEqual(['Suya Spot']);
    expect((await get('?search=adeyemi')).body.meta.total).toBe(2);
    expect((await get('?search=abuja')).body.meta.total).toBe(1);
    expect((await get('?approvalStatus=draft')).body.meta.total).toBe(0);
  });
});

describe('GET /admin/vendors/{id}', () => {
  it('shows documents, the full bank account and the latest bank change', async () => {
    const { vendor } = await makeVendor();
    await BankChangeRequest.create({
      vendorId: vendor.id,
      bankCode: '057',
      bankName: 'Zenith Bank',
      accountNumber: '2222222222',
      accountName: 'BISI ADEYEMI',
    });
    const res = await get(`/${vendor.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: vendor.id,
      approvalStatus: 'pending',
      documents: [{ type: 'government_id', label: 'Government ID' }],
      bank: { accountNumber: '0123456789', accountName: 'BISI ADEYEMI', verified: true },
      bankChangeRequest: { bankName: 'Zenith Bank', status: 'pending', decidedAt: null },
      stats: { orders30d: 0, gmv30d: 0, openRefunds: 0 },
    });
    expect((await get('/missing')).status).toBe(404);
  });
});

describe('decisions', () => {
  it('approve: owner notified, audited, /me fresh, Paystack subaccount when live', async () => {
    const { owner, vendor } = await makeVendor();
    paystackMode.live = () => true;
    paystack.createSubaccount = async ({ businessName, bankCode, percentageCharge }) => {
      expect({ businessName, bankCode, percentageCharge }).toEqual({
        businessName: 'Mama Put Kitchen',
        bankCode: '058',
        percentageCharge: 0,
      });
      return 'ACCT_test123';
    };

    const res = await post(`/${vendor.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ approvalStatus: 'approved', rejectionReason: null });
    expect(res.body.data.approvedAt).toEqual(expect.any(String));
    expect((await VendorBankAccount.findOne({ where: { vendorId: vendor.id } })).paystackSubaccountCode).toBe(
      'ACCT_test123',
    );
    expect(await Notification.findOne({ where: { userId: owner.id } })).toMatchObject({
      title: 'Your store is approved',
      link: '/vendor/status',
    });
    expect(await AuditLog.findOne({ where: { action: 'vendor.approve' } })).toMatchObject({
      targetId: vendor.id,
      actorId: admin.id,
    });
    const me = await request(app).get('/api/v1/me').set('Authorization', bearer(owner));
    expect(me.body.data.vendor.approvalStatus).toBe('approved');

    const again = await post(`/${vendor.id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({
      code: 'INVALID_STATUS',
      message: 'Only pending applications can be approved.',
    });
  });

  it('approval stands when Paystack fails', async () => {
    const { vendor } = await makeVendor();
    paystackMode.live = () => true;
    paystack.createSubaccount = async () => {
      throw new Error('Paystack is down');
    };
    expect((await post(`/${vendor.id}/approve`)).body.data.approvalStatus).toBe('approved');
  });

  it('reject needs a reason the owner sees; the vendor can edit again', async () => {
    const { owner, vendor } = await makeVendor();
    expect((await post(`/${vendor.id}/reject`)).body.error.fieldErrors).toEqual({ reason: 'Give a reason' });
    const res = await post(`/${vendor.id}/reject`, { reason: 'The CAC certificate is not readable.' });
    expect(res.body.data).toMatchObject({
      approvalStatus: 'rejected',
      rejectionReason: 'The CAC certificate is not readable.',
    });
    expect(await Notification.findOne({ where: { userId: owner.id } })).toMatchObject({
      body: 'The CAC certificate is not readable.',
    });
    const onboarding = await request(app)
      .patch('/api/v1/vendor/onboarding')
      .set('Authorization', bearer(owner))
      .send({ step: 'type', type: 'home_cook' });
    expect(onboarding.status).toBe(200);
  });

  it('suspend (approved only, with a reason) and reinstate (suspended only)', async () => {
    const { vendor } = await makeVendor({ approvalStatus: 'approved' });
    expect((await post(`/${vendor.id}/reinstate`)).body.error.code).toBe('INVALID_STATUS');
    const suspended = await post(`/${vendor.id}/suspend`, { reason: 'Food safety complaints' });
    expect(suspended.body.data).toMatchObject({
      approvalStatus: 'suspended',
      suspensionReason: 'Food safety complaints',
    });
    const back = await post(`/${vendor.id}/reinstate`);
    expect(back.body.data).toMatchObject({ approvalStatus: 'approved', suspensionReason: null });
    expect(await AuditLog.count({ where: { targetId: vendor.id } })).toBe(2);
  });
});

describe('POST /admin/vendors/{id}/bank-change/{decision}', () => {
  const requestChange = (vendor) =>
    BankChangeRequest.create({
      vendorId: vendor.id,
      bankCode: '057',
      bankName: 'Zenith Bank',
      accountNumber: '2222222222',
      accountName: 'BISI ADEYEMI',
    });

  it('approve makes the new account active and keeps the old one', async () => {
    const { owner, vendor } = await makeVendor({ approvalStatus: 'approved' });
    await requestChange(vendor);
    const res = await post(`/${vendor.id}/bank-change/approve`);
    expect(res.status).toBe(200);
    expect(res.body.data.bank).toMatchObject({ bankName: 'Zenith Bank', accountNumber: '2222222222' });
    expect(res.body.data.bankChangeRequest).toMatchObject({ status: 'approved', decidedAt: expect.any(String) });
    expect(await VendorBankAccount.count({ where: { vendorId: vendor.id, status: 'replaced' } })).toBe(1);
    expect(await AuditLog.count({ where: { action: 'vendor.bank_change_approved' } })).toBe(1);
    expect(await Notification.findOne({ where: { userId: owner.id } })).toMatchObject({
      title: 'Your new bank account is approved',
    });
    expect((await post(`/${vendor.id}/bank-change/approve`)).status).toBe(404);
  });

  it('reject keeps the current account; unknown decisions are 400', async () => {
    const { vendor } = await makeVendor({ approvalStatus: 'approved' });
    await requestChange(vendor);
    expect((await post(`/${vendor.id}/bank-change/maybe`)).status).toBe(400);
    const res = await post(`/${vendor.id}/bank-change/reject`);
    expect(res.body.data.bank.accountNumber).toBe('0123456789');
    expect(res.body.data.bankChangeRequest.status).toBe('rejected');
  });
});
