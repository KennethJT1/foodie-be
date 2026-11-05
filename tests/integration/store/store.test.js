import { beforeEach, describe, expect, it } from '@jest/globals';
import { SEED_IDS, categoryId } from '../../../src/db/seed/ids.js';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { CATEGORIES } from '../../../src/db/seed/data/catalogue.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createFoodItem, createPublicVendor, createUpload, createUser } from '../../helpers/factories.js';

const { FoodItem, VendorBankAccount, BankChangeRequest, AuditLog, Notification, VendorStaff } = models;

let owner;
let vendor;
let auth;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await models.Category.bulkCreate(CATEGORIES);
  // Basic: 20 items, 1 photo, 1 staff
  ({ owner, vendor } = await createPublicVendor({
    firstName: 'Bisi',
    lastName: 'Adeyemi',
    vendor: { planId: SEED_IDS.planBasic },
  }));
  auth = bearer(owner);
});

const api = (method, path, body) => {
  const req = request(app)[method](`/api/v1/vendor${path}`).set('Authorization', auth);
  return body === undefined ? req : req.send(body);
};

const photo = async () => (await createUpload(owner, 'food_photo')).url;

const ITEM = {
  name: 'Party jollof rice',
  description: 'Smoky jollof',
  categoryId: categoryId('rice'),
  price: 350000,
  portion: '1 plate',
  prepTimeMins: 20,
  optionGroups: [
    { name: 'Extra protein', required: false, max: 2, options: [{ name: 'Chicken', price: 100000 }, { name: 'Beef' }] },
  ],
};

describe('vendor menu', () => {
  it('creates an item with the vendor’s own photo, then lists it with the plan limits', async () => {
    const created = await api('post', '/menu', { ...ITEM, photos: [await photo()] });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: 'Party jollof rice',
      slug: 'party-jollof-rice',
      categoryName: 'Rice dishes',
      isAvailable: true,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      optionGroups: [
        {
          name: 'Extra protein',
          max: 2,
          options: [
            { name: 'Chicken', price: 100000 },
            { name: 'Beef', price: 0 },
          ],
        },
      ],
    });
    expect(created.body.data.optionGroups[0].id).toEqual(expect.any(String));

    const list = await api('get', '/menu');
    expect(list.body.meta.limits).toEqual({ menuItems: 20, photosPerItem: 1, staff: 1, planName: 'Basic', used: 1 });
    const one = await api('get', `/menu/${created.body.data.id}`);
    expect(one.body.data.limits.planName).toBe('Basic');
  });

  it('validates fields, photos (own uploads, plan limit) and option groups', async () => {
    const bad = await api('post', '/menu', {
      name: 'X',
      categoryId: 'nope',
      price: 0,
      photos: [await photo(), await photo()],
      availableFrom: '07:00',
      optionGroups: [{ name: '', options: [] }],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fieldErrors).toEqual({
      name: 'Enter the food name',
      categoryId: 'Pick a category',
      price: 'Price must be more than ₦0',
      photos: 'Your Basic plan allows 1 photo per item',
      availableFrom: 'Enter both times',
      'optionGroups.0.name': 'Add at least one option',
    });
    const stranger = await createUpload(await createUser({ role: 'vendor' }), 'food_photo');
    const notMine = await api('post', '/menu', { ...ITEM, photos: [stranger.url] });
    expect(notMine.body.error.fieldErrors).toEqual({ photos: 'Upload the photos again, then try once more' });
  });

  it('409 PLAN_LIMIT at the plan’s item limit', async () => {
    await models.Plan.update({ menuItemsLimit: 1 }, { where: { id: SEED_IDS.planBasic } });
    await createFoodItem(vendor);
    const res = await api('post', '/menu', { ...ITEM, photos: [await photo()] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'PLAN_LIMIT',
      message: 'Your Basic plan allows 1 menu item. Upgrade to add more.',
    });
  });

  it('PATCH edits fields or just isAvailable; filters; delete is soft; others’ items are 404', async () => {
    const item = await createFoodItem(vendor, { name: 'Beef suya' });
    expect((await api('patch', `/menu/${item.id}`, { isAvailable: false })).body.data.isAvailable).toBe(false);
    expect((await api('get', '/menu?availability=sold_out')).body.meta.total).toBe(1);
    const edited = await api('patch', `/menu/${item.id}`, { price: 300000, name: 'Beef suya (large)' });
    expect(edited.body.data).toMatchObject({ price: 300000, name: 'Beef suya (large)', photos: item.photos });

    const { vendor: other } = await createPublicVendor();
    const theirs = await createFoodItem(other);
    expect((await api('patch', `/menu/${theirs.id}`, { isAvailable: false })).status).toBe(404);

    expect((await api('delete', `/menu/${item.id}`)).status).toBe(204);
    expect(await FoodItem.findByPk(item.id)).toBeNull();
    expect(await FoodItem.findByPk(item.id, { paranoid: false })).not.toBeNull();
    expect((await api('get', `/menu/${item.id}`)).status).toBe(404);
  });
});

describe('store settings', () => {
  it('shows the bank as the last 4 digits and edits hours, pause, radius and page details', async () => {
    await VendorBankAccount.create({
      vendorId: vendor.id,
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      accountNumber: '0123456789',
      accountName: 'BISI ADEYEMI',
    });
    const store = await api('get', '/store');
    expect(store.body.data.bank).toEqual({
      bankName: 'Guaranty Trust Bank',
      accountName: 'BISI ADEYEMI',
      accountNumberLast4: '6789',
    });

    const hours = [0, 1, 2, 3, 4, 5, 6].map((day) =>
      day === 0 ? { closed: true } : { open: '08:00', close: '20:00' },
    );
    const logo = await createUpload(owner, 'vendor_logo');
    const res = await api('patch', '/store', {
      openingHours: hours,
      isPaused: true,
      deliveryRadiusKm: 12,
      description: 'New',
      logo: logo.url,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isPaused: true, deliveryRadiusKm: 12, description: 'New', logo: logo.url });
    expect(res.body.data.openingHours[0]).toMatchObject({ day: 0, closed: true });
    expect(res.body.data.openingHours[1]).toEqual({ day: 1, open: '08:00', close: '20:00', closed: false });

    const bad = await api('patch', '/store', {
      openingHours: [{ open: '09:00', close: '08:00' }],
      deliveryRadiusKm: 50,
      prepTimeMins: 2,
    });
    expect(bad.body.error.fieldErrors).toEqual({
      openingHours: 'Set hours for every day',
      deliveryRadiusKm: 'Pick a delivery radius',
      prepTimeMins: 'Pick a usual preparation time',
    });
  });

  it('bank change: resolved, pending for an admin, one at a time', async () => {
    const reviewer = await createUser({ role: 'admin', adminRole: 'onboarding', phone: null });
    const res = await api('post', '/bank-change', { bankCode: '057', accountNumber: '2222222222' });
    expect(res.status).toBe(200);
    expect(res.body.data.bankChangeRequest).toMatchObject({
      bankName: 'Zenith Bank',
      accountName: 'BISI ADEYEMI',
      status: 'pending',
    });
    expect(await BankChangeRequest.count()).toBe(1);
    expect(await AuditLog.count({ where: { action: 'vendor.bank_change_requested' } })).toBe(1);
    expect(await Notification.count({ where: { userId: reviewer.id, title: 'Bank change to review' } })).toBe(1);
    const again = await api('post', '/bank-change', { bankCode: '044', accountNumber: '3333333333' });
    expect(again.status).toBe(409);
    expect((await api('post', '/bank-change', { bankCode: '057', accountNumber: '12' })).status).toBe(422);
  });
});

describe('staff', () => {
  it('adds within the plan limit, refuses taken emails, removes', async () => {
    const added = await api('post', '/staff', {
      name: 'Tayo Ade',
      email: 'Tayo@Example.com',
      role: 'kitchen',
      phone: '08031112222',
    });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ email: 'tayo@example.com', role: 'kitchen', phone: '+2348031112222' });

    const limit = await api('post', '/staff', { name: 'Second', email: 'two@example.com', role: 'manager' });
    expect(limit.status).toBe(409);
    expect(limit.body.error.code).toBe('PLAN_LIMIT');

    await vendor.update({ planId: SEED_IDS.planPro });
    expect(
      (await api('post', '/staff', { name: 'Bisi', email: owner.email, role: 'manager' })).body.error.fieldErrors,
    ).toEqual({
      email: 'That email already has an account',
    });
    expect((await api('post', '/staff', { name: 'X', email: 'bad', role: 'chef' })).body.error.fieldErrors).toEqual({
      name: "Enter the person's name",
      email: 'Enter a valid email address',
      role: 'Pick a role',
    });

    const list = await api('get', '/staff');
    expect(list.body.data).toMatchObject({ limit: 3, planName: 'Pro', staff: [{ name: 'Tayo Ade' }] });
    expect((await api('delete', `/staff/${added.body.data.id}`)).status).toBe(204);
    expect(await VendorStaff.count()).toBe(0);
  });
});
