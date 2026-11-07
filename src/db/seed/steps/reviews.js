// Phase 18 seed (handoff 8): about 45% of delivered orders are rated, the vendor and the rider
// each. Ratings already on vendors and riders are the demo's own numbers and are left alone.
import { models, newId } from '../../index.js';

const { Order, Review, User } = models;

const VENDOR_COMMENTS = [
  'Delicious as always!',
  'Food was great, delivery a bit slow.',
  'Generous portion.',
  'Will order again.',
  '',
];
const RIDER_COMMENTS = ['Very polite rider.', 'Fast delivery!', ''];
const REPLIES = ['Thank you! See you again soon.', 'Thanks for the kind words.', "Sorry about the wait. We're on it."];

export const reviews = async ({ transaction, faker }) => {
  const delivered = await Order.findAll({
    where: { status: 'delivered' },
    attributes: ['id', 'customerId', 'vendorId', 'riderId', 'updatedAt'],
    order: [['createdAt', 'ASC']],
    transaction,
  });
  const names = new Map(
    (await User.findAll({ where: { role: 'customer' }, attributes: ['id', 'firstName', 'lastName'], transaction })).map(
      (u) => [u.id, u.name],
    ),
  );
  const rows = [];
  const rated = [];
  for (const order of delivered) {
    if (!faker.datatype.boolean(0.45) || !order.riderId) continue;
    const base = { orderId: order.id, userId: order.customerId, userName: names.get(order.customerId) ?? 'Customer' };
    const at = order.updatedAt;
    const replied = faker.datatype.boolean(0.3);
    rows.push(
      {
        id: newId(),
        ...base,
        targetType: 'vendor',
        targetId: order.vendorId,
        rating: faker.helpers.weightedArrayElement([
          { weight: 6, value: 5 },
          { weight: 3, value: 4 },
          { weight: 1, value: 3 },
          { weight: 0.5, value: 2 },
        ]),
        comment: faker.helpers.arrayElement(VENDOR_COMMENTS),
        reply: replied ? faker.helpers.arrayElement(REPLIES) : null,
        repliedAt: replied ? new Date(at.getTime() + 3 * 60 * 60 * 1000) : null,
        createdAt: at,
        updatedAt: at,
      },
      {
        id: newId(),
        ...base,
        targetType: 'rider',
        targetId: order.riderId,
        rating: faker.helpers.arrayElement([5, 5, 4, 4, 3]),
        comment: faker.helpers.arrayElement(RIDER_COMMENTS),
        reply: null,
        repliedAt: null,
        createdAt: at,
        updatedAt: at,
      },
    );
    rated.push(order.id);
  }
  await Review.bulkCreate(rows, { transaction });
  if (rated.length) {
    await Order.update({ ratedVendor: true, ratedRider: true }, { where: { id: rated }, transaction, silent: true });
  }
};
