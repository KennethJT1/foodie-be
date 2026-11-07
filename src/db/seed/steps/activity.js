// Phase 21 seed (handoff 8.4): the bell and the audit log of a lived-in world. The other steps
// write rows directly (no flows run), so this adds the in-app notifications the demo users would
// have had, and 60 admin audit entries over the last 30 days pointing at real rows.
import { Op } from 'sequelize';
import { SEED_IDS } from '../ids.js';
import { models, newId } from '../../index.js';

const { AuditLog, Notification, Order, Refund, Rider, RiderPayoutStatement, Subscription, User, Vendor } = models;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// [action, target type, how to name it]
const ACTIONS = [
  ['vendor.approve', 'vendor', (t) => `Approved ${t.name}`],
  ['vendor.reject', 'vendor', (t) => `Rejected ${t.name}: documents not readable`],
  ['rider.approve', 'rider', (t) => `Approved ${t.name}`],
  ['order.reassign', 'order', (t) => `KJT-${t.code}: reassigned to another rider`],
  ['refund.escalated', 'refund', (t) => `KJT-${t.orderCode}: vendor unreachable`],
  ['payout.approved', 'payout', (t) => `${t.month}: ₦${(t.amount / 100).toLocaleString('en-NG')}`],
  ['payout.marked_paid', 'payout', (t) => `${t.month}: ₦${(t.amount / 100).toLocaleString('en-NG')}`],
  ['customer.suspended', 'user', (t) => `${t.name}: repeated chargebacks`],
  ['subscription.extended', 'subscription', () => 'Extended by 7 days (goodwill)'],
  ['settings.updated', 'settings', () => 'Changed deliveryPerKm'],
];

export const activity = async ({ transaction, faker, now }) => {
  const ago = (mins) => new Date(now - mins * MINUTE);

  // ── Notifications for the demo users ──
  const adaLive = await Order.findOne({ where: { customerId: SEED_IDS.ada, status: 'picked_up' }, transaction });
  const rows = [];
  const notify = (userId, type, title, body, link, mins, read = false) =>
    rows.push({
      id: newId(),
      userId,
      type,
      title,
      body,
      link,
      readAt: read ? ago(mins - 1) : null,
      createdAt: ago(mins),
    });
  if (adaLive) {
    notify(
      SEED_IDS.ada,
      'order',
      'Your food is on the way',
      `Order KJT-${adaLive.code}`,
      `/account/orders/${adaLive.id}`,
      4,
    );
    notify(
      SEED_IDS.ada,
      'order',
      'The vendor has your order',
      `Order KJT-${adaLive.code}`,
      `/account/orders/${adaLive.id}`,
      30,
      true,
    );
  }
  notify(
    SEED_IDS.ada,
    'social',
    'Mama Put Kitchen posted a new dish',
    'Coconut rice is now on the menu.',
    '/v/mama-put-kitchen',
    600,
    true,
  );
  notify(
    SEED_IDS.ada,
    'refund',
    'Your refund was accepted',
    'The vendor will pay you back soon.',
    '/account/refunds',
    1500,
    true,
  );
  notify(SEED_IDS.bisi, 'order', 'New order', 'You have 2 new orders waiting.', '/vendor/orders', 1);
  notify(
    SEED_IDS.bisi,
    'subscription',
    'Your plan renews in 9 days',
    'Your Pro plan renews automatically.',
    '/vendor/subscription',
    200,
  );
  notify(
    SEED_IDS.bisi,
    'refund',
    'New refund request',
    'A customer asked for a refund. Respond within 48 h.',
    '/vendor/refunds',
    400,
  );
  notify(
    SEED_IDS.bisi,
    'social',
    'New comment',
    'Someone commented on Party jollof rice.',
    '/vendor/engagement',
    900,
    true,
  );
  notify(
    SEED_IDS.tundeUser,
    'payout',
    'Your payout has been sent',
    'Your statement for last month is paid.',
    '/rider/earnings',
    3000,
    true,
  );
  notify(
    SEED_IDS.chidi,
    'subscription',
    'Your plan has expired',
    'Renew to make your store visible again.',
    '/vendor/subscription',
    60,
  );
  notify(
    SEED_IDS.support,
    'refund',
    'Refund disputed',
    'A customer says they have not received the money.',
    '/admin/refunds',
    90,
  );
  notify(
    SEED_IDS.onboarding,
    'system',
    'New vendor application',
    'A store is waiting for review.',
    '/admin/vendors?approvalStatus=pending',
    45,
  );
  await Notification.bulkCreate(rows, { transaction });

  // ── Audit log: 60 entries over 30 days by the demo admins ──
  const admins = await User.findAll({ where: { role: 'admin' }, order: [['id', 'ASC']], transaction });
  const named = (list) => list.map((r) => Object.assign(r, { name: r.name ?? r.user?.name }));
  const targets = {
    vendor: await Vendor.findAll({ attributes: ['id', 'name'], order: [['id', 'ASC']], limit: 40, transaction }),
    rider: named(
      await Rider.findAll({
        attributes: ['id'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
        order: [['id', 'ASC']],
        limit: 30,
        transaction,
      }),
    ),
    order: await Order.findAll({
      where: { status: 'delivered' },
      attributes: ['id', 'code'],
      order: [['id', 'ASC']],
      limit: 40,
      transaction,
    }),
    refund: await Refund.findAll({ attributes: ['id', 'orderCode'], order: [['id', 'ASC']], transaction }),
    payout: await RiderPayoutStatement.findAll({
      where: { status: { [Op.ne]: 'draft' } },
      attributes: ['id', 'month', 'amount'],
      order: [['id', 'ASC']],
      limit: 40,
      transaction,
    }),
    user: await User.findAll({
      where: { role: 'customer', status: { [Op.ne]: 'active' } },
      order: [['id', 'ASC']],
      transaction,
    }),
    subscription: await Subscription.findAll({ attributes: ['id'], order: [['id', 'ASC']], limit: 20, transaction }),
    settings: [{ id: 'platform' }],
  };
  const entries = [];
  for (let i = 0; i < 60; i += 1) {
    const actor = faker.helpers.arrayElement(admins);
    const [action, targetType, summary] = faker.helpers.arrayElement(
      ACTIONS.filter(([, type]) => targets[type].length),
    );
    const target = faker.helpers.arrayElement(targets[targetType]);
    entries.push({
      id: newId(),
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.adminRole,
      action,
      targetType,
      targetId: target.id,
      summary: summary(target),
      ip: faker.internet.ipv4(),
      createdAt: new Date(now - faker.number.int({ min: 10 * MINUTE, max: 30 * DAY })),
    });
  }
  await AuditLog.bulkCreate(entries, { transaction });
};
