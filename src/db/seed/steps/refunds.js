// Phase 19 seed (handoff 8): about 20 refund requests cycling through every status with matching
// timelines: two of Ada's, four at Mama Put, the rest anywhere. Same shape as the mock's seed.
import { DEFAULT_SETTINGS } from '../../../modules/settings/settings.defaults.js';
import { seedId } from '../ids.js';
import { models, newId } from '../../index.js';

const { FoodItem, Order, OrderItem, Refund } = models;
const HOUR = 3600_000;

const REASONS = [
  'Food arrived cold',
  'Wrong item delivered',
  'Missing items',
  'Food was spoilt',
  'Order never arrived',
  'Portion smaller than shown',
];
const DETAILS = ['The rice was cold and hard.', 'I ordered two packs but got one.', 'The chicken was missing.', ''];
const STATUSES = ['requested', 'requested', 'accepted', 'paid', 'confirmed', 'rejected', 'disputed', 'escalated'];

export const refunds = async ({ transaction, faker, now }) => {
  const delivered = await Order.findAll({
    where: { status: 'delivered' },
    order: [['createdAt', 'DESC']],
    transaction,
  });
  const ada = seedId('usr_customer_ada');
  const mamaPut = seedId('ven_mama_put');
  const candidates = [
    ...delivered.filter((o) => o.customerId === ada).slice(1, 3),
    ...delivered.filter((o) => o.vendorId === mamaPut && o.customerId !== ada).slice(0, 4),
    ...faker.helpers.arrayElements(delivered, 14),
  ];
  const hours = DEFAULT_SETTINGS.refundDeadlineHours;
  const seen = new Set();
  const rows = [];

  for (const [i, order] of candidates.entries()) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    const status = STATUSES[i % STATUSES.length];
    // Open requests are recent enough to still be inside their deadline
    const createdAt = new Date(
      status === 'requested'
        ? now - (i + 1) * HOUR
        : Math.min(order.updatedAt.getTime() + HOUR, now - (i + 1) * 5 * HOUR),
    );
    const at = (mins) => new Date(createdAt.getTime() + mins * 60_000).toISOString();
    const amount = faker.datatype.boolean(0.6) ? order.subtotal : Math.round(order.subtotal / 2 / 100) * 100;
    const timeline = [{ status: 'requested', at: at(0), by: 'customer', note: null }];
    let vendorResponse = null;
    let paymentReference = null;
    if (['accepted', 'paid', 'confirmed', 'disputed'].includes(status)) {
      vendorResponse = { decision: 'accepted', amount, reason: 'Sorry about that. Refunding you now.', at: at(90) };
      timeline.push({ status: 'accepted', at: at(90), by: 'vendor', note: vendorResponse.reason });
    }
    if (['paid', 'confirmed', 'disputed'].includes(status)) {
      paymentReference = `RF_${faker.string.alphanumeric({ length: 10, casing: 'upper' })}`;
      timeline.push({ status: 'paid', at: at(200), by: 'vendor', note: `Reference ${paymentReference}` });
    }
    if (status === 'confirmed') timeline.push({ status: 'confirmed', at: at(400), by: 'customer', note: null });
    if (status === 'disputed') {
      timeline.push({ status: 'disputed', at: at(400), by: 'customer', note: 'I have not received the money.' });
    }
    if (status === 'rejected') {
      const reason = 'The rider confirmed the food was delivered hot and complete.';
      vendorResponse = { decision: 'rejected', amount: 0, reason, at: at(60) };
      timeline.push({ status: 'rejected', at: at(60), by: 'vendor', note: reason });
    }
    if (status === 'escalated') {
      timeline.push({
        status: 'escalated',
        at: at(hours * 60),
        by: 'system',
        note: 'Vendor did not respond before the deadline.',
      });
    }
    const firstItem = await OrderItem.findOne({
      where: { orderId: order.id },
      order: [['sortOrder', 'ASC']],
      transaction,
    });
    const dish = firstItem && (await FoodItem.findByPk(firstItem.foodItemId, { transaction, paranoid: false }));
    rows.push({
      id: newId(),
      orderId: order.id,
      customerId: order.customerId,
      vendorId: order.vendorId,
      orderCode: order.code,
      customerName: order.customerName,
      vendorName: order.vendorName,
      reason: faker.helpers.arrayElement(REASONS),
      details: faker.helpers.arrayElement(DETAILS),
      amount,
      orderSubtotal: order.subtotal,
      photos: faker.datatype.boolean(0.5) && dish?.photos?.[0] ? [dish.photos[0]] : [],
      status,
      deadline: new Date(createdAt.getTime() + hours * HOUR),
      vendorResponse,
      paymentReference,
      escalated: status === 'escalated',
      timeline,
      comments: [],
      deadlineHandledAt: status === 'escalated' ? new Date(createdAt.getTime() + hours * HOUR) : null,
      createdAt,
      updatedAt: new Date(timeline.at(-1).at),
    });
  }
  await Refund.bulkCreate(rows, { transaction });
};
