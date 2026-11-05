import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { CATEGORIES } from '../../../src/db/seed/data/catalogue.js';
import { reference } from '../../../src/db/seed/steps/reference.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createFoodItem, createPublicVendor, createUser } from '../../helpers/factories.js';

const { AuditLog, Comment, FoodItem, Notification, Report, Vendor } = models;

let ada;
let owner;
let vendor;
let dish;

beforeEach(async () => {
  await resetDatabase();
  await reference({});
  await models.Category.bulkCreate(CATEGORIES);
  ada = await createUser({ firstName: 'Ada', lastName: 'Okafor' });
  ({ owner, vendor } = await createPublicVendor({ vendor: { name: 'Mama Put Kitchen' } }));
  dish = await createFoodItem(vendor, { name: 'Party jollof rice', likesCount: 5 });
});

const api = (method, path, who, body) => {
  const req = request(app)[method](`/api/v1${path}`);
  if (who) req.set('Authorization', bearer(who));
  return body === undefined ? req : req.send(body);
};

describe('likes and follows', () => {
  it('like / unlike are idempotent and keep the counter; /me/likes lists them', async () => {
    expect((await api('post', `/food-items/${dish.id}/likes`, ada)).body.data).toEqual({
      foodItemId: dish.id,
      isLiked: true,
      likesCount: 6,
    });
    expect((await api('post', `/food-items/${dish.id}/likes`, ada)).body.data.likesCount).toBe(6);
    const mine = await api('get', '/me/likes', ada);
    expect(mine.body.data).toMatchObject([{ id: dish.id, isLiked: true }]);
    expect((await api('get', `/food-items/${dish.id}`, ada)).body.data.isLiked).toBe(true);
    expect((await api('delete', `/food-items/${dish.id}/likes`, ada)).body.data).toMatchObject({
      isLiked: false,
      likesCount: 5,
    });
    expect((await api('post', `/food-items/${dish.id}/likes`, owner)).status).toBe(403);
    expect((await api('post', '/food-items/nope/likes', ada)).status).toBe(404);
  });

  it('follow / unfollow update followersCount; /me/follows; hidden stores are 404', async () => {
    expect((await api('post', `/vendors/${vendor.id}/follow`, ada)).body.data).toEqual({
      vendorId: vendor.id,
      isFollowing: true,
      followersCount: 1,
    });
    expect((await api('get', '/me/follows', ada)).body.data).toMatchObject([{ id: vendor.id, isFollowing: true }]);
    expect((await api('delete', `/vendors/${vendor.id}/follow`, ada)).body.data.followersCount).toBe(0);
    await vendor.update({ subscriptionStatus: 'expired' });
    expect((await api('post', `/vendors/${vendor.id}/follow`, ada)).status).toBe(404);
  });
});

describe('comments', () => {
  it('customer comments, the dish’s vendor replies, the other side is notified', async () => {
    const c = await api('post', `/food-items/${dish.id}/comments`, ada, { body: '  So good  ' });
    expect(c.status).toBe(201);
    expect(c.body.data).toMatchObject({
      body: 'So good',
      parentId: null,
      isMine: true,
      author: { name: 'Ada Okafor' },
    });
    expect(await Notification.count({ where: { userId: owner.id, title: 'New comment' } })).toBe(1);

    const reply = await api('post', `/food-items/${dish.id}/comments`, owner, {
      body: 'Thank you!',
      parentId: c.body.data.id,
    });
    expect(reply.body.data).toMatchObject({ isVendorReply: true, author: { name: 'Mama Put Kitchen' } });
    expect(await Notification.count({ where: { userId: ada.id, title: 'The vendor replied to your comment' } })).toBe(
      1,
    );

    const list = await api('get', `/food-items/${dish.id}/comments`);
    expect(list.body.meta).toMatchObject({ nextCursor: null, total: 1, commentsCount: 2 });
    expect(list.body.data[0].replies).toMatchObject([{ body: 'Thank you!', isMine: false }]);
  });

  it('rules: 500 characters, vendors only reply on their own dishes, customers can’t reply', async () => {
    expect(
      (await api('post', `/food-items/${dish.id}/comments`, ada, { body: 'x'.repeat(501) })).body.error.fieldErrors,
    ).toEqual({
      body: 'Keep it under 500 characters',
    });
    expect((await api('post', `/food-items/${dish.id}/comments`, ada, { body: ' ' })).status).toBe(422);
    expect((await api('post', `/food-items/${dish.id}/comments`, owner, { body: 'Buy it' })).status).toBe(422);
    const { owner: rival } = await createPublicVendor();
    const c = await api('post', `/food-items/${dish.id}/comments`, ada, { body: 'Nice' });
    expect(
      (
        await api('post', `/food-items/${dish.id}/comments`, rival, {
          body: 'Ours is better',
          parentId: c.body.data.id,
        })
      ).status,
    ).toBe(403);
  });

  it('authors edit (editedAt) and delete ("Comment removed"); others get 403', async () => {
    const c = (await api('post', `/food-items/${dish.id}/comments`, ada, { body: 'First' })).body.data;
    const someone = await createUser();
    expect((await api('patch', `/comments/${c.id}`, someone, { body: 'Hacked' })).status).toBe(403);
    const edited = await api('patch', `/comments/${c.id}`, ada, { body: 'Edited' });
    expect(edited.body.data).toMatchObject({ body: 'Edited', editedAt: expect.any(String) });
    expect((await api('delete', `/comments/${c.id}`, ada)).body.data).toEqual({ id: c.id, removed: true });
    const list = await api('get', `/food-items/${dish.id}/comments`);
    expect(list.body.data[0]).toMatchObject({ body: null, removed: true });
  });
});

describe('feed', () => {
  it('nearby, popular, newest and following tabs with cursors', async () => {
    const { vendor: island } = await createPublicVendor({ vendor: { lat: 6.4281, lng: 3.4219 } });
    const far = await createFoodItem(island, { name: 'Island dish', likesCount: 500 });
    const near2 = await createFoodItem(vendor, { name: 'Second dish', commentsCount: 1 });
    const page = (q, who) => api('get', `/feed?lat=6.5158&lng=3.3794&${q}`, who);

    expect((await page('tab=nearby')).body.data.map((f) => f.name)).toEqual([
      'Second dish',
      'Party jollof rice',
      'Island dish',
    ]);
    expect((await page('tab=popular')).body.data[0].name).toBe('Island dish');
    expect((await page('tab=newest&limit=1')).body.meta).toEqual({ nextCursor: '1', limit: 1, total: 3 });
    expect((await page('tab=newest&limit=1&cursor=2')).body.meta.nextCursor).toBeNull();
    expect((await page('tab=following', ada)).body.data).toEqual([]);
    await api('post', `/vendors/${island.id}/follow`, ada);
    expect((await page('tab=following', ada)).body.data.map((f) => f.id)).toEqual([far.id]);
    expect((await page('categoryId=cat-grills')).body.meta.total).toBe(0);
    expect(near2.id).toBeDefined();
  });
});

describe('vendor engagement and comments', () => {
  it('counts likes, followers and unanswered comments; answered filter', async () => {
    const answered = (await api('post', `/food-items/${dish.id}/comments`, ada, { body: 'Answer me' })).body.data;
    await api('post', `/food-items/${dish.id}/comments`, ada, { body: 'Still waiting' });
    await api('post', `/food-items/${dish.id}/comments`, owner, { body: 'Done', parentId: answered.id });
    await api('post', `/vendors/${vendor.id}/follow`, ada);

    const eng = await api('get', '/vendor/engagement', owner);
    expect(eng.body.data).toMatchObject({
      likesCount: 5,
      followersCount: 1,
      newFollowers: 1,
      unansweredComments: 1,
      topLiked: [{ id: dish.id, likesCount: 5 }],
      recentFollowers: [{ name: 'Ada Okafor' }],
    });
    const waiting = await api('get', '/vendor/comments?answered=false', owner);
    expect(waiting.body.data.map((c) => c.body)).toEqual(['Still waiting']);
    const done = await api('get', '/vendor/comments?answered=true', owner);
    expect(done.body.data[0]).toMatchObject({ body: 'Answer me', isAnswered: true, reply: { body: 'Done' } });
  });
});

describe('reports and moderation', () => {
  it('one open report per person; resolving settles every open report on the target', async () => {
    const c = (await api('post', `/food-items/${dish.id}/comments`, ada, { body: 'Spam spam' })).body.data;
    const first = await api('post', '/reports', ada, { targetType: 'comment', targetId: c.id, reason: 'Spam' });
    expect(first.status).toBe(201);
    expect((await api('post', '/reports', ada, { targetType: 'comment', targetId: c.id, reason: 'Spam' })).status).toBe(
      200,
    );
    await api('post', '/reports', owner, { targetType: 'comment', targetId: c.id, reason: 'Harassment' });
    expect(
      (await api('post', '/reports', ada, { targetType: 'food_item', targetId: 'nope', reason: 'x' })).status,
    ).toBe(404);

    const mod = await createUser({ role: 'admin', adminRole: 'support', phone: null });
    const queue = await api('get', '/admin/reports?status=open', mod);
    expect(queue.body.meta.total).toBe(2);
    expect(queue.body.data[0].target).toMatchObject({ body: 'Spam spam', foodItemName: 'Party jollof rice' });

    const res = await api('post', `/admin/reports/${first.body.data.id}/resolve`, mod, { action: 'hide' });
    expect(res.body.data).toMatchObject({ status: 'resolved', action: 'hide', target: { isHidden: true } });
    expect(await Report.count({ where: { status: 'open' } })).toBe(0);
    expect((await Comment.findByPk(c.id)).hidden).toBe(true);
    expect(await AuditLog.count({ where: { action: 'comment.hidden' } })).toBe(1);
    expect((await api('post', `/admin/reports/${first.body.data.id}/resolve`, mod, { action: 'dismiss' })).status).toBe(
      409,
    );
  });

  it('removing a reported dish hides it from the public and tells the vendor', async () => {
    const r = (
      await api('post', '/reports', ada, { targetType: 'food_item', targetId: dish.id, reason: 'Unsafe food' })
    ).body.data;
    const mod = await createUser({ role: 'admin', adminRole: 'super_admin', phone: null });
    await api('post', `/admin/reports/${r.id}/resolve`, mod, { action: 'remove' });
    expect((await FoodItem.findByPk(dish.id)).isHidden).toBe(true);
    expect((await api('get', `/food-items/${dish.id}`)).status).toBe(404);
    expect(await Notification.count({ where: { userId: owner.id, title: 'Party jollof rice was removed' } })).toBe(1);
    expect(await Vendor.count()).toBe(1);
  });
});
