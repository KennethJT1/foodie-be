import { beforeEach, describe, expect, it } from '@jest/globals';
import { NotFoundError } from '../../../src/core/errors/index.js';
import { getQueue } from '../../../src/core/queue/index.js';
import { models, withTransaction } from '../../../src/db/index.js';
import {
  createNotification,
  listNotifications,
  markAllRead,
  markRead,
  notify,
  unreadCount,
} from '../../../src/modules/notifications/notifications.service.js';
import { resetDatabase } from '../../helpers/db.js';
import { createUser } from '../../helpers/factories.js';

const { Notification } = models;
const ADA = 'usr_customer_ada';
const BISI = 'usr_vendor_bisi';

const seed = () =>
  Notification.bulkCreate([
    {
      id: 'n1',
      userId: ADA,
      type: 'order',
      title: 'Order accepted',
      body: 'Mama Put accepted it',
      link: '/orders/o1',
      createdAt: new Date('2026-10-27T10:00:00Z'),
    },
    {
      id: 'n2',
      userId: ADA,
      type: 'refund',
      title: 'Refund paid',
      body: '₦3,500 is on its way',
      readAt: new Date('2026-10-28T09:00:00Z'),
      createdAt: new Date('2026-10-28T08:00:00Z'),
    },
    {
      id: 'n3',
      userId: ADA,
      type: 'order',
      title: 'On the way',
      body: 'Tunde picked up your order',
      createdAt: new Date('2026-10-28T12:00:00Z'),
    },
    {
      id: 'n4',
      userId: BISI,
      type: 'order',
      title: 'New order',
      body: 'KJT-4F7Q2A',
      createdAt: new Date('2026-10-28T12:00:00Z'),
    },
  ]);

describe('notifications service', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createUser({ id: ADA });
    await createUser({ id: BISI, role: 'vendor' });
    await seed();
  });

  it("lists only the user's own, newest first, in the contract shape", async () => {
    const { data, meta } = await listNotifications(ADA, {});
    expect(data.map((n) => n.id)).toEqual(['n3', 'n2', 'n1']);
    expect(meta).toMatchObject({ page: 1, limit: 20, total: 3 });
    expect(data[2]).toEqual({
      id: 'n1',
      type: 'order',
      title: 'Order accepted',
      body: 'Mama Put accepted it',
      link: '/orders/o1',
      readAt: null,
      createdAt: '2026-10-27T10:00:00.000Z',
    });
  });

  it('filters by type and unread=true; scope ignores a userId param', async () => {
    expect((await listNotifications(ADA, { unread: 'true' })).data.map((n) => n.id)).toEqual(['n3', 'n1']);
    expect((await listNotifications(ADA, { unread: 'false' })).meta.total).toBe(3);
    expect((await listNotifications(ADA, { type: 'refund' })).data.map((n) => n.id)).toEqual(['n2']);
    expect((await listNotifications(ADA, { userId: BISI })).meta.total).toBe(3);
  });

  it('counts unread', async () => {
    expect(await unreadCount(ADA)).toEqual({ count: 2 });
    expect(await unreadCount('usr_nobody')).toEqual({ count: 0 });
  });

  it("marks one read; someone else's is a 404", async () => {
    const read = await markRead(ADA, 'n1');
    expect(read.readAt).toEqual(expect.any(String));
    expect((await markRead(ADA, 'n1')).readAt).toBe(read.readAt);
    await expect(markRead(ADA, 'n4')).rejects.toBeInstanceOf(NotFoundError);
    await expect(markRead(ADA, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it("marks all read without touching other users'", async () => {
    expect(await markAllRead(ADA)).toEqual({ done: true });
    expect(await unreadCount(ADA)).toEqual({ count: 0 });
    expect(await unreadCount(BISI)).toEqual({ count: 1 });
    expect((await Notification.findByPk('n2')).readAt.toISOString()).toBe('2026-10-28T09:00:00.000Z');
  });

  it('createNotification is idempotent by id (job retries)', async () => {
    const payload = { id: 'n9', userId: ADA, type: 'system', title: 'Hi', body: 'Welcome' };
    await createNotification(payload);
    await createNotification({ ...payload, title: 'Changed' });
    expect(await Notification.count({ where: { id: 'n9' } })).toBe(1);
    expect((await Notification.findByPk('n9')).title).toBe('Hi');
  });
});

describe('notify', () => {
  const queue = () => getQueue('notifications');

  beforeEach(async () => {
    await resetDatabase();
    await createUser({ id: ADA });
  });

  it('queues SMS only after the transaction commits', async () => {
    const notification = await withTransaction((transaction) =>
      notify(
        ADA,
        { type: 'order', title: 'Order accepted', body: 'On it' },
        {
          transaction,
          sms: { to: '+2348030000001', text: 'Mama Put accepted your order' },
        },
      ),
    );
    const job = await queue().getJob(`sms-${notification.id}`);
    expect(job.name).toBe('sms.send');
    expect(job.data).toEqual({ to: '+2348030000001', text: 'Mama Put accepted your order' });
    await job.remove();
  });

  it('writes and sends nothing when the transaction rolls back', async () => {
    let id;
    await expect(
      withTransaction(async (transaction) => {
        ({ id } = await notify(
          ADA,
          { type: 'order', title: 'x', body: 'y' },
          { transaction, sms: { to: '+234', text: 'z' } },
        ));
        throw new Error('order update failed');
      }),
    ).rejects.toThrow('order update failed');

    expect(await Notification.count()).toBe(0);
    expect(await queue().getJob(`sms-${id}`)).toBeUndefined();
  });

  it('does nothing without a user', async () => {
    expect(await notify(null, { type: 'order', title: 'x', body: 'y' })).toBeNull();
  });
});
