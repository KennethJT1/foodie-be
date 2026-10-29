import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { models } from '../../../src/db/index.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createUser } from '../../helpers/factories.js';

const { Notification } = models;

describe('/notifications', () => {
  let user;
  let other;

  beforeEach(async () => {
    await resetDatabase();
    user = await createUser();
    other = await createUser();
    await Notification.bulkCreate([
      { id: 'n1', userId: user.id, type: 'order', title: 'Order accepted', body: 'Mama Put accepted it' },
      { id: 'n2', userId: user.id, type: 'refund', title: 'Refund paid', body: '₦3,500 is on its way' },
      { id: 'n3', userId: other.id, type: 'order', title: 'New order', body: 'KJT-4F7Q2A' },
    ]);
  });

  it('401 without a token', async () => {
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });

  it('lists, counts and marks read', async () => {
    const auth = bearer(user);
    const list = await request(app).get('/api/v1/notifications?unread=true&limit=1').set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2, hasNextPage: true });

    expect((await request(app).get('/api/v1/notifications/unread-count').set('Authorization', auth)).body.data).toEqual(
      { count: 2 },
    );

    const read = await request(app).post('/api/v1/notifications/n1/read').set('Authorization', auth);
    expect(read.body.data).toMatchObject({ id: 'n1', readAt: expect.any(String) });
    expect((await request(app).post('/api/v1/notifications/n3/read').set('Authorization', auth)).status).toBe(404);

    expect((await request(app).post('/api/v1/notifications/read-all').set('Authorization', auth)).body.data).toEqual({
      done: true,
    });
    expect((await request(app).get('/api/v1/notifications/unread-count').set('Authorization', auth)).body.data).toEqual(
      { count: 0 },
    );
    expect(
      (await request(app).get('/api/v1/notifications/unread-count').set('Authorization', bearer(other))).body.data,
    ).toEqual({ count: 1 });
  });
});
