import { beforeEach, describe, expect, it } from '@jest/globals';
import { categoryId } from '../../../src/db/seed/ids.js';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { CATEGORIES } from '../../../src/db/seed/data/catalogue.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { isOpenAt } from '../../../src/core/utils/index.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createFoodItem, createPublicVendor, createUser } from '../../helpers/factories.js';

let mama;
let far;
let jollof;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await models.Category.bulkCreate(CATEGORIES);
  ({ vendor: mama } = await createPublicVendor({
    vendor: { name: 'Mama Put Kitchen', slug: 'mama-put-kitchen', rating: 4.7 },
  }));
  // Victoria Island, about 10 km from Yaba
  ({ vendor: far } = await createPublicVendor({
    vendor: { name: 'Island Grill', lat: 6.4281, lng: 3.4219, rating: 4.1, city: 'Lagos' },
  }));
  jollof = await createFoodItem(mama, { name: 'Party jollof rice', price: 350000, likesCount: 50 });
  await createFoodItem(mama, {
    name: 'Beef suya',
    categoryId: categoryId('grills'),
    price: 200000,
    likesCount: 10,
    isAvailable: false,
  });
  await createFoodItem(far, {
    name: 'Grilled catfish',
    categoryId: categoryId('grills'),
    price: 700000,
    likesCount: 30,
  });
});

const get = (path) => request(app).get(`/api/v1${path}`);
const names = (res) => res.body.data.map((f) => f.name);

describe('GET /categories', () => {
  it('lists by sortOrder with public dish counts', async () => {
    const res = await get('/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
    expect(res.body.data[0]).toMatchObject({ id: categoryId('rice'), name: 'Rice dishes', itemCount: 1 });
    expect(res.body.data.find((c) => c.id === categoryId('grills')).itemCount).toBe(2);
  });
});

describe('GET /food-items', () => {
  it('public dishes only, most liked first; sold out stays visible', async () => {
    const hidden = await createFoodItem(mama, { name: 'Hidden dish', isHidden: true });
    const deleted = await createFoodItem(mama, { name: 'Deleted dish' });
    await deleted.destroy();
    const { vendor: expired } = await createPublicVendor({ vendor: { subscriptionStatus: 'expired' } });
    await createFoodItem(expired, { name: 'Expired store dish' });

    const res = await get('/food-items');
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Party jollof rice', 'Grilled catfish', 'Beef suya']);
    expect(res.body.data[2].isAvailable).toBe(false);
    expect(res.body.data[0]).toMatchObject({
      categoryName: 'Rice dishes',
      isLiked: false,
      vendor: { id: mama.id, name: 'Mama Put Kitchen', isOpen: true },
    });
    expect((await get(`/food-items/${hidden.id}`)).status).toBe(404);
  });

  it('search, category, price, rating, availability and distance filters', async () => {
    expect(names(await get('/food-items?search=mama put'))).toEqual(['Party jollof rice', 'Beef suya']);
    expect(names(await get('/food-items?search=grills'))).toEqual(['Grilled catfish', 'Beef suya']);
    expect(names(await get(`/food-items?categoryId=${categoryId('grills')}&available=true`))).toEqual([
      'Grilled catfish',
    ]);
    expect(names(await get('/food-items?minPrice=300000&maxPrice=400000'))).toEqual(['Party jollof rice']);
    expect(names(await get('/food-items?minRating=4.5'))).toEqual(['Party jollof rice', 'Beef suya']);
    // From Yaba: Mama Put is next door, the island 10 km away
    const near = await get('/food-items?lat=6.5158&lng=3.3794&maxDistanceKm=3');
    expect(names(near)).toEqual(['Party jollof rice', 'Beef suya']);
    const sorted = await get('/food-items?lat=6.4281&lng=3.4219&sort=distanceM');
    expect(sorted.body.data[0]).toMatchObject({ name: 'Grilled catfish', distanceM: 0 });
    expect(names(await get('/food-items?sort=price'))).toEqual(['Beef suya', 'Party jollof rice', 'Grilled catfish']);
  });

  it('distance from the signed-in user’s default address, else central Lagos', async () => {
    const ada = await createUser();
    await models.Address.create({
      userId: ada.id,
      line1: '1 Ozumba',
      area: 'Victoria Island',
      city: 'Lagos',
      lat: 6.4281,
      lng: 3.4219,
      isDefault: true,
    });
    const mine = await request(app).get(`/api/v1/food-items/${jollof.id}`).set('Authorization', bearer(ada));
    expect(mine.body.data.distanceM).toBeGreaterThan(9000);
    expect((await get(`/food-items/${jollof.id}`)).body.data.distanceM).toBeLessThan(2000);
  });
});

describe('vendors', () => {
  it('GET /vendors lists public stores, best rated first, with menu counts', async () => {
    await createPublicVendor({ vendor: { approvalStatus: 'suspended' } });
    const res = await get('/vendors');
    expect(res.body.data.map((v) => v.name)).toEqual(['Mama Put Kitchen', 'Island Grill']);
    expect(res.body.data[0]).toMatchObject({
      itemCount: 2,
      categoryIds: expect.arrayContaining([categoryId('rice'), categoryId('grills')]),
    });
    expect(res.body.data[0].openingHours).toHaveLength(7);
    expect((await get('/vendors?search=yaba')).body.meta.total).toBe(2);
  });

  it('GET /vendors/{slugOrId}: storefront by slug or id; 404 when hidden', async () => {
    const res = await get('/vendors/mama-put-kitchen');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: mama.id, address: { area: 'Yaba' }, isFollowing: false });
    expect(res.body.data.bank).toBeUndefined();
    expect((await get(`/vendors/${far.id}`)).body.data.name).toBe('Island Grill');
    await far.update({ subscriptionStatus: 'expired' });
    expect((await get(`/vendors/${far.id}`)).status).toBe(404);
  });

  it('a paused store is shown closed', async () => {
    await mama.update({ isPaused: true });
    expect((await get('/vendors/mama-put-kitchen')).body.data).toMatchObject({ isOpen: false, isPaused: true });
  });
});

describe('isOpenAt (Lagos time)', () => {
  const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '09:00', close: day === 5 ? '02:00' : '21:00' }));
  it('opens and closes on Lagos time and handles closing after midnight', () => {
    // Thursday 2026-11-05 08:30 UTC = 09:30 Lagos
    expect(isOpenAt(hours, new Date('2026-11-05T08:30:00Z'))).toBe(true);
    expect(isOpenAt(hours, new Date('2026-11-05T20:30:00Z'))).toBe(false);
    // Saturday 01:00 Lagos is still Friday's late night
    expect(isOpenAt(hours, new Date('2026-11-07T00:00:00Z'))).toBe(true);
    expect(isOpenAt([{ day: 4, open: '09:00', close: '21:00', closed: true }], new Date('2026-11-05T10:00:00Z'))).toBe(
      false,
    );
  });
});
