import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { DEFAULT_SETTINGS } from '../../../src/modules/settings/settings.defaults.js';
import { getSettings, requiredDocuments } from '../../../src/modules/settings/settings.service.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

let auth;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  auth = bearer(
    await createUser({ role: 'admin', adminRole: 'super_admin', firstName: 'Kenneth', lastName: 'Taiwo', phone: null }),
  );
});

const patch = (body) => request(app).patch('/api/v1/admin/settings').set('Authorization', auth).send(body);

describe('GET /admin/settings', () => {
  it('returns the seeded settings, service areas and templates (handoff 8.3)', async () => {
    const res = await request(app).get('/api/v1/admin/settings').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      ...DEFAULT_SETTINGS,
      serviceAreas: ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Enugu', 'Kano'],
      notificationTemplates: [
        expect.objectContaining({ key: 'order_paid', channel: 'email', subject: 'We got your order' }),
        expect.objectContaining({ key: 'order_on_the_way', channel: 'sms', subject: '' }),
        expect.objectContaining({ key: 'vendor_new_order', channel: 'sms' }),
        expect.objectContaining({ key: 'subscription_reminder', channel: 'email' }),
      ],
    });
  });

  it('falls back to the defaults for keys without a row', async () => {
    await models.Setting.destroy({ where: { key: 'riderPayoutPct' } });
    await patch({ trialDays: 7 }).expect(200);
    expect((await getSettings()).riderPayoutPct).toBe(70);
  });
});

describe('PATCH /admin/settings', () => {
  it('saves a change, the next read uses it (cache invalidated), and it is audited', async () => {
    expect((await getSettings()).riderPayoutPct).toBe(70);
    const res = await patch({ riderPayoutPct: 75, deliveryBaseFee: 60000, refundMissedAction: 'warn', trialDays: 14 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ riderPayoutPct: 75, deliveryBaseFee: 60000, refundMissedAction: 'warn' });
    expect((await getSettings()).riderPayoutPct).toBe(75);
    expect((await request(app).get('/api/v1/admin/settings').set('Authorization', auth)).body.data.riderPayoutPct).toBe(
      75,
    );

    const [entry] = await models.AuditLog.findAll();
    expect(entry).toMatchObject({
      action: 'settings.updated',
      targetType: 'settings',
      targetId: 'platform',
      actorName: 'Kenneth Taiwo',
      // Form field order; trialDays was unchanged, so it is not listed
      summary: 'Changed deliveryBaseFee, riderPayoutPct, refundMissedAction',
    });
  });

  it('no change writes nothing', async () => {
    await patch({
      riderPayoutPct: 70,
      serviceAreas: ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Enugu', 'Kano'],
    }).expect(200);
    expect(await models.AuditLog.count()).toBe(0);
  });

  it('service areas: adds, reorders and retires cities (kept, not deleted)', async () => {
    const res = await patch({ serviceAreas: [' Abuja ', 'lagos', 'Benin City', 'Abuja', ''] });
    expect(res.body.data.serviceAreas).toEqual(['Abuja', 'Lagos', 'Benin City']);
    const kano = await models.ServiceArea.findOne({ where: { name: 'Kano' } });
    expect(kano).toMatchObject({ isActive: false, lat: 12.0022 });
    expect(await models.ServiceArea.findOne({ where: { name: 'Benin City' } })).toMatchObject({
      lat: null,
      isActive: true,
    });

    await patch({ serviceAreas: ['Kano'] }).expect(200);
    expect((await getSettings()).serviceAreas).toEqual(['Kano']);
  });

  it('templates: edits by key', async () => {
    const res = await patch({
      notificationTemplates: [{ key: 'order_on_the_way', channel: 'sms', body: '  On the way! Code {{code}}  ' }],
    });
    expect(res.body.data.notificationTemplates[1]).toEqual({
      key: 'order_on_the_way',
      channel: 'sms',
      subject: '',
      body: 'On the way! Code {{code}}',
    });
    expect(res.body.data.notificationTemplates[0].subject).toBe('We got your order');
  });

  it('422 with the mock wording', async () => {
    const res = await patch({
      riderPayoutPct: 120,
      vendorAcceptTimeoutSec: 30,
      deliveryPerKm: 'free',
      trialDays: 1.5,
      refundMissedAction: 'shrug',
      serviceAreas: ['  '],
      notificationTemplates: [
        { key: 'order_paid', channel: 'email', body: ' ' },
        { key: 'made_up', channel: 'pigeon', body: 'x' },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors).toEqual({
      riderPayoutPct: 'Enter a rider payout % between 0 and 100',
      vendorAcceptTimeoutSec: 'Enter a accept timeout between 60 and 1800',
      deliveryPerKm: 'Enter a fee per km between 0 and 500000',
      trialDays: 'Enter a trial length between 0 and 90',
      refundMissedAction: 'Pick an action',
      serviceAreas: 'Keep at least one city',
      'notificationTemplates.0.body': 'Write the message',
      'notificationTemplates.1.channel': 'Pick a channel',
    });

    const fees = await patch({ deliveryMaxFee: 40000 });
    expect(fees.body.error.fieldErrors).toEqual({ deliveryMaxFee: 'The maximum fee must be at least the base fee' });
    const unknown = await patch({ notificationTemplates: [{ key: 'made_up', channel: 'sms', body: 'x' }] });
    expect(unknown.body.error.fieldErrors).toEqual({ 'notificationTemplates.0.key': 'Unknown template' });
    expect(await models.AuditLog.count()).toBe(0);
  });
});

describe('required documents', () => {
  it('lists each type in order', async () => {
    expect((await requiredDocuments('restaurant')).map((d) => d.type)).toEqual([
      'government_id',
      'cac_certificate',
      'food_permit',
    ]);
    expect(await requiredDocuments('home_cook')).toHaveLength(1);
    expect((await requiredDocuments('rider')).map((d) => d.type)).toContain('guarantor_form');
  });
});
