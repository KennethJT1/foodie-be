import { NotFoundError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { logger } from '../../config/logger.js';
import { addJob, jobId } from '../../core/queue/index.js';
import { models, newId } from '../../db/index.js';

const { Notification } = models;

// GET /notifications (05-backend-handoff.md, section 3)
const LIST_CONFIG = {
  filters: {
    type: 'type',
    // Only `unread=true` narrows the list; anything else shows everything, like the mock
    unread: ([value]) => (value === 'true' ? { readAt: null } : undefined),
  },
  dateField: 'createdAt',
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', readAt: 'readAt', type: 'type' },
};

export const toNotificationDto = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link ?? null,
  readAt: n.readAt ? n.readAt.toISOString() : null,
  createdAt: n.createdAt.toISOString(),
});

export const listNotifications = async (userId, query) => {
  const { data, meta } = await paginate(Notification, buildListQuery(query, LIST_CONFIG, { scope: { userId } }));
  return { data: data.map(toNotificationDto), meta };
};

export const unreadCount = async (userId) => ({
  count: await Notification.count({ where: { userId, readAt: null } }),
});

/** Marks one of the user's notifications as read; someone else's is a 404. Reading twice is fine. */
export const markRead = async (userId, id) => {
  const notification = await Notification.findOne({ where: { id, userId } });
  if (!notification) throw new NotFoundError("We couldn't find that notification.");
  if (!notification.readAt) await notification.update({ readAt: new Date() });
  return toNotificationDto(notification);
};

export const markAllRead = async (userId) => {
  await Notification.update({ readAt: new Date() }, { where: { userId, readAt: null } });
  return { done: true };
};

/** Inserts the row; an existing id is left alone, so retried jobs never duplicate. */
export const createNotification = async (
  { id = newId(), userId, type, title, body, link, data },
  { transaction } = {},
) => {
  const [notification] = await Notification.findOrCreate({
    where: { id },
    defaults: { userId, type, title, body, link, data },
    transaction,
  });
  return notification;
};

/**
 * Tells a user about something: always an in-app notification, plus SMS / email when given.
 * Used by every later phase (order steps, refunds, approvals, payouts...).
 *
 *   await notify(order.customerId, { type: 'order', title: 'Order accepted', body: '...', link: `/orders/${order.id}` },
 *     { transaction, sms: { to: customer.phone, text: '...' } });
 *
 * Inside a transaction the in-app row commits or rolls back with the caller's changes, and SMS /
 * email are queued only after commit, so nobody is texted about something that didn't happen.
 */
export const notify = async (userId, payload, { transaction, sms, email } = {}) => {
  if (!userId) return null;
  const notification = await createNotification({ userId, ...payload }, { transaction });

  const sendChannels = () =>
    Promise.all([
      sms && addJob('notifications', 'sms.send', sms, { jobId: jobId('sms', notification.id) }),
      email && addJob('notifications', 'email.send', email, { jobId: jobId('email', notification.id) }),
    ]);

  if (sms || email) {
    if (!transaction) await sendChannels();
    else {
      // The caller's changes are already committed here: a Redis failure must not turn that into an
      // error for the caller, so log it (the in-app notification is saved either way)
      transaction.afterCommit(() =>
        sendChannels().catch((err) =>
          logger.error({ err, notificationId: notification.id }, 'Could not queue SMS / email'),
        ),
      );
    }
  }
  return notification;
};

/** Queues the in-app notification instead of writing it now (for workers and bulk sends). */
export const notifyLater = (userId, payload) => {
  const id = newId();
  return addJob('notifications', 'inapp.create', { id, userId, ...payload }, { jobId: jobId('inapp', id) });
};
