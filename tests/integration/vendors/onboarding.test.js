import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUpload, createUser } from '../../helpers/factories.js';

let owner;
let auth;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  owner = await createUser({ role: 'vendor', firstName: 'Tolu', lastName: 'Ogunleye' });
  auth = bearer(owner);
});

const api = (method, path, body) => {
  const req = request(app)[method](`/api/v1${path}`).set('Authorization', auth);
  return body === undefined ? req : req.send(body);
};
const save = (body) => api('patch', '/vendor/onboarding', body);

const BUSINESS = { step: 'business', name: "Tolu's Pot", description: 'Home cooking', phone: '0803 123 4567' };
const LOCATION = {
  step: 'location',
  address: { line1: '12 Herbert Macaulay Way', area: 'Yaba', city: 'lagos', state: 'Lagos' },
  lat: 6.5158,
  lng: 3.3794,
  deliveryRadiusKm: 8,
  prepTimeMins: 25,
};

const attach = async (type) => {
  const upload = await createUpload(owner, 'vendor_document');
  return api('post', '/vendor/documents', { type, url: upload.url });
};

/** A home cook with every step done, ready to submit. */
const completeWizard = async () => {
  await save({ step: 'type', type: 'home_cook' });
  await save(BUSINESS);
  await save(LOCATION);
  await attach('government_id');
  await save({ step: 'documents' });
  return save({ step: 'bank', bankCode: '058', accountNumber: '0123456789' });
};

describe('GET /vendor/onboarding', () => {
  it('returns the empty draft', async () => {
    const res = await api('get', '/vendor/onboarding');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      step: 'type',
      approvalStatus: 'draft',
      type: null,
      address: null,
      documents: [],
      requiredDocuments: [],
      bank: null,
    });
  });

  it('is for vendors only', async () => {
    const customer = await createUser();
    const res = await request(app).get('/api/v1/vendor/onboarding').set('Authorization', bearer(customer));
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/v1/vendor/onboarding')).status).toBe(401);
  });
});

describe('PATCH /vendor/onboarding', () => {
  it('saves each step and only moves progress forward', async () => {
    let res = await save({ step: 'type', type: 'restaurant' });
    expect(res.body.data).toMatchObject({ step: 'business', type: 'restaurant' });
    expect(res.body.data.requiredDocuments.map((d) => d.type)).toEqual([
      'government_id',
      'cac_certificate',
      'food_permit',
    ]);

    res = await save(BUSINESS);
    expect(res.body.data).toMatchObject({
      step: 'location',
      name: "Tolu's Pot",
      slug: 'tolus-pot',
      phone: '+2348031234567',
      logo: null,
    });

    res = await save(LOCATION);
    expect(res.body.data).toMatchObject({
      step: 'documents',
      address: { line1: '12 Herbert Macaulay Way', area: 'Yaba', city: 'Lagos', state: 'Lagos' },
      lat: 6.5158,
      lng: 3.3794,
      deliveryRadiusKm: 8,
      prepTimeMins: 25,
    });

    // Going back to edit an earlier step keeps the saved progress
    res = await save({ ...BUSINESS, description: 'Changed' });
    expect(res.body.data).toMatchObject({ step: 'documents', description: 'Changed' });
  });

  it('needs the type first and validates every field', async () => {
    expect((await save(BUSINESS)).body.error.fieldErrors).toEqual({ type: 'Pick what kind of vendor you are first' });
    expect((await save({ step: 'type', type: 'caterer' })).body.error.fieldErrors).toEqual({
      type: 'Pick what kind of vendor you are',
    });
    await save({ step: 'type', type: 'restaurant' });

    const business = await save({ step: 'business', name: 'A', description: 'x'.repeat(301), phone: '123' });
    expect(business.status).toBe(422);
    expect(business.body.error.fieldErrors).toEqual({
      name: 'Enter your business name',
      description: 'Keep it under 300 characters',
      phone: 'Enter a valid Nigerian phone number',
    });

    const location = await save({ step: 'location', address: { city: 'Atlantis' }, deliveryRadiusKm: 50 });
    expect(location.body.error.fieldErrors).toEqual({
      'address.line1': 'Enter the street address',
      'address.area': 'Enter the area',
      'address.city': 'Pick a city',
      pin: 'Drop a pin where riders pick up food',
      deliveryRadiusKm: 'Pick a delivery radius',
      prepTimeMins: 'Pick a usual preparation time',
    });

    expect((await save({ step: 'documents' })).body.error.fieldErrors).toEqual({
      government_id: 'Upload your Government ID',
      cac_certificate: 'Upload your CAC certificate',
      food_permit: 'Upload your Food-handling permit',
    });
    expect((await save({ step: 'payouts' })).body.error.fieldErrors).toEqual({ step: 'Unknown step' });
  });

  it('refuses a store name another vendor has', async () => {
    const other = await createUser({ role: 'vendor' });
    await models.Vendor.update({ slug: 'tolus-pot' }, { where: { ownerUserId: other.id } });
    await save({ step: 'type', type: 'home_cook' });
    expect((await save(BUSINESS)).body.error.fieldErrors).toEqual({
      name: 'Another store already uses that name. Try adding your area.',
    });
  });

  it('logo and cover must be the vendor’s own uploads', async () => {
    await save({ step: 'type', type: 'home_cook' });
    const logo = await createUpload(owner, 'vendor_logo');
    const someoneElses = await createUpload(await createUser({ role: 'vendor' }), 'vendor_cover');
    const res = await save({ ...BUSINESS, logo: logo.url, cover: someoneElses.url });
    expect(res.body.error.fieldErrors).toEqual({ cover: 'Upload the file again, then try once more' });
    const ok = await save({ ...BUSINESS, logo: logo.url });
    expect(ok.body.data.logo).toBe(logo.url);
  });

  it('resolves and stores the bank account (numbers ending 0000 are not found)', async () => {
    await save({ step: 'type', type: 'home_cook' });
    const missing = await save({ step: 'bank', bankCode: '058', accountNumber: '0123450000' });
    expect(missing.body.error.fieldErrors).toEqual({
      accountNumber: "We couldn't find that account. Check the number and the bank.",
    });
    const res = await save({ step: 'bank', bankCode: '058', accountNumber: '0123456789' });
    expect(res.body.data.bank).toEqual({
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      accountNumber: '0123456789',
      accountName: 'TOLU OGUNLEYE',
      verified: true,
    });
    await save({ step: 'bank', bankCode: '057', accountNumber: '1111111111' });
    expect(await models.VendorBankAccount.count()).toBe(1);
  });

  it('changing the type drops documents the new type does not need', async () => {
    await save({ step: 'type', type: 'restaurant' });
    await attach('government_id');
    await attach('cac_certificate');
    const res = await save({ step: 'type', type: 'home_cook' });
    expect(res.body.data.documents.map((d) => d.type)).toEqual(['government_id']);
  });
});

describe('documents', () => {
  beforeEach(() => save({ step: 'type', type: 'restaurant' }));

  it('attaches one per type (a new upload replaces the old), with a signed link', async () => {
    const first = await attach('cac_certificate');
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ type: 'cac_certificate', label: 'CAC certificate' });
    expect(first.body.data.url).toContain('api_key=');

    const second = await attach('cac_certificate');
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await models.VendorDocument.count()).toBe(1);
  });

  it('422 for an unknown type or a file that is not the vendor’s document upload', async () => {
    expect((await attach('passport_photo')).body.error.fieldErrors).toEqual({ type: 'Pick which document this is' });
    const photo = await createUpload(owner, 'vendor_logo');
    const res = await api('post', '/vendor/documents', { type: 'food_permit', url: photo.url });
    expect(res.body.error.fieldErrors).toEqual({ url: 'Upload the file again, then try once more' });
  });

  it('deletes before submitting; 404 for someone else’s', async () => {
    const doc = (await attach('food_permit')).body.data;
    expect((await api('delete', `/vendor/documents/${doc.id}`)).status).toBe(204);
    expect((await api('delete', `/vendor/documents/${doc.id}`)).status).toBe(404);
  });
});

describe('POST /vendor/onboarding/submit', () => {
  it('422 until every step is done', async () => {
    await save({ step: 'type', type: 'home_cook' });
    const res = await api('post', '/vendor/onboarding/submit');
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Some steps are not finished yet. Check each step and try again.');
    expect(Object.keys(res.body.error.fieldErrors)).toEqual(['business', 'location', 'documents', 'bank']);
  });

  it('sends the application: pending, default hours, reviewers notified, then locked', async () => {
    const reviewer = await createUser({ role: 'admin', adminRole: 'onboarding', phone: null });
    const finance = await createUser({ role: 'admin', adminRole: 'finance', phone: null });
    expect((await completeWizard()).body.data.step).toBe('review');

    const res = await api('post', '/vendor/onboarding/submit');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ step: 'submitted', approvalStatus: 'pending', rejectionReason: null });
    expect(res.body.data.submittedAt).toEqual(expect.any(String));

    const vendor = await models.Vendor.findOne({ where: { ownerUserId: owner.id } });
    expect(await models.VendorOpeningHour.count({ where: { vendorId: vendor.id } })).toBe(7);
    expect(await models.Notification.count({ where: { userId: reviewer.id, title: 'New vendor to review' } })).toBe(1);
    expect(await models.Notification.count({ where: { userId: finance.id } })).toBe(0);

    const me = await api('get', '/me');
    expect(me.body.data.vendor).toMatchObject({ approvalStatus: 'pending', onboardingStep: 'submitted' });

    for (const [method, path, body] of [
      ['patch', '/vendor/onboarding', BUSINESS],
      ['post', '/vendor/onboarding/submit'],
      ['post', '/vendor/documents', { type: 'government_id', url: 'x' }],
    ]) {
      const locked = await api(method, path, body);
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe('ALREADY_SUBMITTED');
    }
  });
});
