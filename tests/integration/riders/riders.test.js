import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUpload, createUser } from '../../helpers/factories.js';

const { Rider, RiderDocument, Notification, AuditLog } = models;

let user;
let auth;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  user = await createUser({ role: 'rider', firstName: 'Kemi', lastName: 'Adebayo', phone: '+2348030000006' });
  auth = bearer(user);
});

const api = (method, path, body, who = auth) => {
  const req = request(app)[method](`/api/v1${path}`).set('Authorization', who);
  return body === undefined ? req : req.send(body);
};
const save = (body) => api('patch', '/rider/onboarding', body);

const VEHICLE = { step: 'vehicle', vehicleType: 'motorcycle', plateNumber: 'lsr-123ab', licenceNumber: 'abc123456' };
const GUARANTOR = {
  step: 'guarantor',
  guarantor: { name: 'Bola Adebayo', phone: '08061234567', relationship: 'Uncle', address: '4 Ojuelegba Road, Lagos' },
};
const DOCS = ['government_id', 'drivers_licence', 'vehicle_papers', 'guarantor_form'];

const attach = async (type) => {
  const upload = await createUpload(user, 'rider_document');
  return api('post', '/rider/documents', { type, url: upload.url });
};

const completeWizard = async () => {
  await save(VEHICLE);
  await save(GUARANTOR);
  for (const type of DOCS) await attach(type);
  await save({ step: 'documents' });
  return save({ step: 'bank', bankCode: '044', accountNumber: '0123456789' });
};

describe('rider onboarding', () => {
  it('starts empty and saves each step, moving forward only', async () => {
    const start = await api('get', '/rider/onboarding');
    expect(start.body.data).toMatchObject({
      step: 'vehicle',
      approvalStatus: 'draft',
      vehicleType: null,
      guarantor: null,
      documents: [],
      bank: null,
    });
    expect(start.body.data.requiredDocuments.map((d) => d.type)).toEqual(DOCS);

    const vehicle = await save(VEHICLE);
    expect(vehicle.body.data).toMatchObject({
      step: 'guarantor',
      vehicleType: 'motorcycle',
      plateNumber: 'LSR-123AB',
      licenceNumber: 'ABC123456',
    });
    const guarantor = await save(GUARANTOR);
    expect(guarantor.body.data).toMatchObject({
      step: 'documents',
      guarantor: { name: 'Bola Adebayo', phone: '+2348061234567', relationship: 'Uncle' },
    });
    expect((await save({ ...VEHICLE, vehicleType: 'bicycle', plateNumber: '' })).body.data).toMatchObject({
      step: 'documents',
      vehicleType: 'bicycle',
      plateNumber: '',
    });
  });

  it('validates every step', async () => {
    expect((await save({ step: 'vehicle', vehicleType: 'boat' })).body.error.fieldErrors).toEqual({
      vehicleType: 'Pick your vehicle',
      plateNumber: 'Enter the plate number',
      licenceNumber: "Enter your driver's or rider's licence number",
    });
    expect(
      (await save({ step: 'guarantor', guarantor: { name: 'Al', phone: '08030000006', address: 'x' } })).body.error
        .fieldErrors,
    ).toEqual({
      'guarantor.name': "Enter your guarantor's full name",
      'guarantor.phone': "Your guarantor can't use your own number",
      'guarantor.relationship': 'How do you know them?',
      'guarantor.address': 'Enter their home address',
    });
    expect((await save({ step: 'documents' })).body.error.fieldErrors).toMatchObject({
      government_id: 'Upload your government id',
    });
    expect((await save({ step: 'type' })).body.error.fieldErrors).toEqual({ step: 'Unknown step' });
  });

  it('documents: one per type, own uploads only, removable before submitting', async () => {
    const first = await attach('drivers_licence');
    expect(first.status).toBe(201);
    await attach('drivers_licence');
    expect(await RiderDocument.count()).toBe(1);
    const vendorFile = await createUpload(user, 'vendor_document');
    expect(
      (await api('post', '/rider/documents', { type: 'government_id', url: vendorFile.url })).body.error.fieldErrors,
    ).toEqual({ url: 'Upload the file again, then try once more' });
    const docId = (await RiderDocument.findOne()).id;
    expect((await api('delete', `/rider/documents/${docId}`)).status).toBe(204);
  });

  it('submit: 422 until finished, then pending, reviewers notified and locked', async () => {
    const reviewer = await createUser({ role: 'admin', adminRole: 'onboarding', phone: null });
    const early = await api('post', '/rider/onboarding/submit');
    expect(early.status).toBe(422);
    expect(Object.keys(early.body.error.fieldErrors)).toEqual(['vehicle', 'guarantor', 'documents', 'bank']);

    expect((await completeWizard()).body.data.step).toBe('review');
    const res = await api('post', '/rider/onboarding/submit');
    expect(res.body.data).toMatchObject({ step: 'submitted', approvalStatus: 'pending' });
    expect(await Notification.count({ where: { userId: reviewer.id, title: 'New rider to review' } })).toBe(1);
    const locked = await save(VEHICLE);
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('ALREADY_SUBMITTED');
  });

  it('GET /rider/me shows the payout account as its last 4 digits and the payout %', async () => {
    await completeWizard();
    const res = await api('get', '/rider/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Kemi Adebayo',
      phone: '+2348030000006',
      approvalStatus: 'draft',
      isOnline: false,
      payoutPct: 70,
      bank: { bankName: 'Access Bank', accountName: 'KEMI ADEBAYO', accountNumberLast4: '6789' },
    });
    expect(res.body.data.bank.accountNumber).toBeUndefined();
  });

  it('is for riders only', async () => {
    expect((await api('get', '/rider/me', undefined, bearer(await createUser()))).status).toBe(403);
  });
});

describe('admin rider review', () => {
  let admin;
  let pendingId;

  beforeEach(async () => {
    admin = bearer(await createUser({ role: 'admin', adminRole: 'onboarding', phone: null }));
    await completeWizard();
    await api('post', '/rider/onboarding/submit');
    pendingId = (await Rider.findOne({ where: { userId: user.id } })).id;
    await createUser({ role: 'rider' }); // a draft, never listed
  });

  const adminApi = (method, path, body) => api(method, `/admin/riders${path}`, body, admin);

  it('lists riders (not drafts) with filters and search', async () => {
    const list = await adminApi('get', '');
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      id: pendingId,
      name: 'Kemi Adebayo',
      vehicleType: 'motorcycle',
      plateNumber: 'LSR-123AB',
      approvalStatus: 'pending',
      isOnline: false,
      isBusy: false,
    });
    expect((await adminApi('get', '?search=lsr-123')).body.meta.total).toBe(1);
    expect((await adminApi('get', '?search=adebayo')).body.meta.total).toBe(1);
    expect((await adminApi('get', '?online=true')).body.meta.total).toBe(0);
    expect((await adminApi('get', '?vehicleType=car')).body.meta.total).toBe(0);
  });

  it('detail shows licence, guarantor, documents and the full bank account', async () => {
    const res = await adminApi('get', `/${pendingId}`);
    expect(res.body.data).toMatchObject({
      licenceNumber: 'ABC123456',
      guarantor: { name: 'Bola Adebayo' },
      bank: { accountNumber: '0123456789' },
      recentTrips: [],
    });
    expect(res.body.data.documents).toHaveLength(4);
    expect((await adminApi('get', '/missing')).status).toBe(404);
  });

  it('approve, suspend (goes offline), reinstate and reject', async () => {
    const approved = await adminApi('post', `/${pendingId}/approve`);
    expect(approved.body.data.approvalStatus).toBe('approved');
    expect((await api('get', '/me')).body.data.rider).toMatchObject({ approvalStatus: 'approved' });
    expect(await Notification.findOne({ where: { userId: user.id } })).toMatchObject({ title: "You're approved" });

    await Rider.update({ isOnline: true }, { where: { id: pendingId } });
    expect((await adminApi('post', `/${pendingId}/suspend`)).body.error.fieldErrors).toEqual({
      reason: 'Give a reason',
    });
    const suspended = await adminApi('post', `/${pendingId}/suspend`, { reason: 'Late deliveries' });
    expect(suspended.body.data).toMatchObject({
      approvalStatus: 'suspended',
      isOnline: false,
      suspensionReason: 'Late deliveries',
    });
    expect((await adminApi('post', `/${pendingId}/reinstate`)).body.data.approvalStatus).toBe('approved');

    const reject = await adminApi('post', `/${pendingId}/reject`, { reason: 'Blurry licence' });
    expect(reject.status).toBe(409);
    expect(reject.body.error.code).toBe('INVALID_STATUS');
    expect((await AuditLog.findAll()).map((a) => a.action).sort()).toEqual([
      'rider.approve',
      'rider.reinstate',
      'rider.suspend',
    ]);
  });
});
