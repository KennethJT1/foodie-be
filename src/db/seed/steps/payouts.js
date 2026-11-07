// Phase 18 seed (handoff 8): three months of payout statements per approved rider. Last month's is
// draft, approved or paid; the two before are paid with a transfer reference.
import { DEFAULT_SETTINGS } from '../../../modules/settings/settings.defaults.js';
import { lagosMonth, previousMonth } from '../../../modules/payouts/payouts.service.js';
import { seedId } from '../ids.js';
import { models, newId } from '../../index.js';

const { Rider, RiderPayoutStatement, User } = models;
const DAY = 24 * 60 * 60 * 1000;

export const payouts = async ({ transaction, faker, now }) => {
  const riders = await Rider.findAll({
    where: { approvalStatus: 'approved' },
    attributes: ['id'],
    order: [['id', 'ASC']],
    transaction,
  });
  const finance = await User.findOne({ where: { role: 'admin', adminRole: 'finance' }, transaction });
  const pct = DEFAULT_SETTINGS.riderPayoutPct;
  const months = [previousMonth(lagosMonth(new Date(now)))];
  months.push(previousMonth(months[0]), previousMonth(previousMonth(months[0])));

  const rows = [];
  for (const rider of riders) {
    months.forEach((month, i) => {
      const start = new Date(`${month}-01T00:00:00.000Z`).getTime();
      // Days after the month began, never in the future (early in a month)
      const after = (days) => new Date(Math.min(start + days * DAY, now));
      const trips =
        rider.id === seedId('rid_tunde')
          ? faker.number.int({ min: 60, max: 110 })
          : faker.number.int({ min: 10, max: 120 });
      const deliveryFees = trips * faker.number.int({ min: 90_000, max: 160_000 });
      const status = i === 0 ? faker.helpers.arrayElement(['draft', 'approved', 'paid']) : 'paid';
      rows.push({
        id: newId(),
        riderId: rider.id,
        month,
        trips,
        deliveryFees,
        payoutPct: pct,
        amount: Math.round((deliveryFees * pct) / 100),
        adjustments: 0,
        status,
        reference: status === 'paid' ? `TRF_${faker.string.alphanumeric({ length: 10, casing: 'upper' })}` : null,
        approvedAt: status !== 'draft' ? after(33) : null,
        approvedBy: status !== 'draft' ? (finance?.id ?? null) : null,
        paidAt: status === 'paid' ? after(35) : null,
        createdAt: after(31),
        updatedAt: after(31),
      });
    });
  }
  await RiderPayoutStatement.bulkCreate(rows, { transaction });
};
