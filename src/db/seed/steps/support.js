// Phase 20 seed (handoff 8.4): 11 help tickets (Ada, Bisi, Tunde, 6 customers, 2 vendors) about
// real problems, open / pending / resolved / closed; answered ones carry a reply and an internal
// note from the Support admin.
import { SEED_IDS } from '../ids.js';
import { models, newId } from '../../index.js';

const { Order, Rider, SupportMessage, SupportTicket, User, Vendor } = models;

const SUBJECTS = [
  'Rider could not find my address',
  'Payment debited but no order',
  'How do I change my bank account?',
  'Customer refused delivery',
  'Wrong item delivered',
  'App keeps logging me out',
  'I want to upgrade my plan',
  'My payout is late',
];

export const support = async ({ transaction, faker, now }) => {
  const agent = await User.findOne({
    where: { role: 'admin', adminRole: 'support' },
    order: [['createdAt', 'ASC']],
    transaction,
  });
  const ada = await User.findByPk(SEED_IDS.ada, { transaction });
  const bisi = await User.findByPk(SEED_IDS.bisi, { transaction });
  const tunde = await User.findByPk(SEED_IDS.tundeUser, { transaction });
  const customers = await User.findAll({
    where: { role: 'customer', status: 'active' },
    order: [['id', 'ASC']],
    transaction,
  });
  const vendors = await User.findAll({ where: { role: 'vendor' }, order: [['id', 'ASC']], transaction });
  const owners = [
    ada,
    bisi,
    tunde,
    ...faker.helpers.arrayElements(
      customers.filter((c) => c.id !== ada?.id),
      6,
    ),
    ...faker.helpers.arrayElements(
      vendors.filter((v) => v.id !== bisi?.id),
      2,
    ),
  ].filter(Boolean);

  const tickets = [];
  const messages = [];
  for (const [i, user] of owners.entries()) {
    let where = { customerId: user.id };
    if (user.role === 'vendor') {
      const vendor = await Vendor.findOne({ where: { ownerUserId: user.id }, attributes: ['id'], transaction });
      where = { vendorId: vendor?.id ?? '' };
    }
    if (user.role === 'rider') {
      const rider = await Rider.findOne({ where: { userId: user.id }, attributes: ['id'], transaction });
      where = { riderId: rider?.id ?? '' };
    }
    const order = await Order.findOne({
      where,
      attributes: ['id', 'code'],
      order: [['createdAt', 'DESC']],
      transaction,
    });
    const createdAt = faker.date.recent({ days: 10, refDate: now });
    const status = faker.helpers.arrayElement(['open', 'open', 'pending', 'resolved', 'closed']);
    const subject = SUBJECTS[i % SUBJECTS.length];
    const id = newId();
    const thread = [
      {
        authorId: user.id,
        authorName: user.name,
        authorRole: user.role,
        body: `Hello, ${subject.toLowerCase()}. Please help.`,
        internal: false,
        at: createdAt,
      },
    ];
    if (status !== 'open' && agent) {
      thread.push(
        {
          authorId: agent.id,
          authorName: agent.name,
          authorRole: 'admin',
          body: 'Thanks for reaching out. We are looking into it and will update you shortly.',
          internal: false,
          at: new Date(createdAt.getTime() + 30 * 60_000),
        },
        {
          authorId: agent.id,
          authorName: agent.name,
          authorRole: 'admin',
          body: 'Checked Paystack: the transaction is fine.',
          internal: true,
          at: new Date(createdAt.getTime() + 33 * 60_000),
        },
      );
    }
    const lastPublic = thread.filter((m) => !m.internal).at(-1);
    const last = thread.at(-1);
    tickets.push({
      id,
      number: 1000 + i,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      orderId: order?.id ?? null,
      orderCode: order?.code ?? null,
      subject,
      status,
      priority: faker.helpers.arrayElement(['low', 'normal', 'normal', 'high']),
      assigneeId: status === 'open' ? null : (agent?.id ?? null),
      lastMessage: lastPublic.body,
      // The mock's rule: the very last message is a public admin reply
      hasReply: last.authorRole === 'admin' && !last.internal,
      messageCount: thread.length,
      createdAt,
      updatedAt: last.at,
    });
    for (const m of thread) {
      messages.push({
        id: newId(),
        ticketId: id,
        authorId: m.authorId,
        authorName: m.authorName,
        authorRole: m.authorRole,
        body: m.body,
        internal: m.internal,
        createdAt: m.at,
        updatedAt: m.at,
      });
    }
  }
  await SupportTicket.bulkCreate(tickets, { transaction });
  await SupportMessage.bulkCreate(messages, { transaction });
};
