// Admin rider review. Reference behaviour: foodie-fe src/mocks/handlers/admin.js (riderRow,
// riderDetail, decisionHandlers).
import { Op, literal } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { NotFoundError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { distanceSql } from '../../core/utils/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { busyAmong, recentTrips } from '../deliveries/deliveries.service.js';
import { notify } from '../notifications/notifications.service.js';
import { decide, decisionMessage, toDocumentDto } from '../onboarding/onboarding.shared.js';
import { bankAccountOf, documentsOf } from './onboarding.service.js';
import { toAdminRiderRow, toBankDto, toGuarantorDto } from './riders.presenter.js';

const { Order, Rider, User, Vendor } = models;

const userInclude = { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] };

// GET /admin/riders (handoff section 3): search name, phone, plate, city. With `nearOrderId`, only
// free online riders, nearest to that order's vendor first (reassignment).
const LIST_CONFIG = {
  searchFields: ['plateNumber', 'city', '$user.first_name$', '$user.last_name$', '$user.phone$'],
  filters: {
    approvalStatus: 'approvalStatus',
    vehicleType: 'vehicleType',
    city: 'city',
    online: { field: 'isOnline', type: 'boolean' },
  },
  defaultSort: '-createdAt',
  sortable: {
    createdAt: 'createdAt',
    submittedAt: 'submittedAt',
    rating: 'rating',
    tripsCount: 'tripsCount',
    city: 'city',
    approvalStatus: 'approvalStatus',
    lastSeenAt: 'lastSeenAt',
    name: [
      ['user', 'firstName'],
      ['user', 'lastName'],
    ],
  },
  include: [userInclude],
};

const BUSY_RIDERS = literal(
  `(SELECT o.rider_id FROM orders o WHERE o.rider_id IS NOT NULL AND o.status IN ('rider_assigned', 'picked_up'))`,
);

/** The order `nearOrderId` points at, with its vendor's pin; unknown ids are ignored (mock). */
const nearOrder = async (id) => {
  if (!id) return null;
  const order = await Order.findByPk(String(id), {
    attributes: ['id', 'riderId', 'vendorId'],
    include: [{ model: Vendor, as: 'vendor', attributes: ['lat', 'lng'], paranoid: false }],
  });
  return order?.vendor?.lat == null ? null : order;
};

/** GET /admin/riders: everything but drafts; `isBusy` from active deliveries. */
export const listRiders = async (query) => {
  const listQuery = buildListQuery(query, LIST_CONFIG);
  const near = await nearOrder(query.nearOrderId);
  // Not a scope: a scope would drop the client's own approvalStatus filter
  const where = [listQuery.where, { approvalStatus: { [Op.ne]: 'draft' } }];
  let attributes;
  if (near) {
    const distance = literal(distanceSql('`Rider`.`lat`', '`Rider`.`lng`', near.vendor));
    where.push(
      { approvalStatus: 'approved', isOnline: true },
      { id: { [Op.notIn]: BUSY_RIDERS } },
      ...(near.riderId ? [{ id: { [Op.ne]: near.riderId } }] : []),
    );
    attributes = { include: [[distance, 'distanceM']] };
    // Nearest first unless the client sorts; riders without a position go last
    if (!query.sort)
      listQuery.order = [
        [literal('`Rider`.`lat` IS NULL'), 'ASC'],
        [distance, 'ASC'],
      ];
  }
  listQuery.where = { [Op.and]: where };
  const { data, meta } = await paginate(Rider, listQuery, attributes && { attributes });
  const busy = await busyAmong(data.map((r) => r.id));
  return {
    data: data.map((r) => ({
      ...toAdminRiderRow(r, { isBusy: busy.has(r.id) }),
      ...(near && { distanceM: r.lat == null ? null : Number(r.get('distanceM')) }),
    })),
    meta,
  };
};

/** Rider detail with licence, guarantor, documents, bank and recent trips (mock `riderDetail`). */
export const riderDetail = async (id, { transaction } = {}) => {
  const rider = await Rider.findByPk(id, { include: [userInclude], transaction });
  if (!rider) throw new NotFoundError("We couldn't find that rider.");
  const [documents, bank] = await Promise.all([
    documentsOf(rider.id, { transaction }),
    bankAccountOf(rider.id, { transaction }),
  ]);
  const [busy, trips] = await Promise.all([busyAmong([rider.id]), recentTrips(rider.id)]);
  return {
    ...toAdminRiderRow(rider, { isBusy: busy.has(rider.id) }),
    email: rider.user?.email ?? null,
    licenceNumber: rider.licenceNumber,
    guarantor: toGuarantorDto(rider),
    documents: documents.map(toDocumentDto),
    bank: toBankDto(bank),
    rejectionReason: rider.rejectionReason,
    suspensionReason: rider.suspensionReason,
    approvedAt: rider.approvedAt ? rider.approvedAt.toISOString() : null,
    recentTrips: trips,
  };
};

/** POST /admin/riders/{id}/approve|reject|suspend|reinstate */
export const decideRider = async (actor, id, action, body, req) => {
  await withTransaction(async (transaction) => {
    const rider = await lockForUpdate(Rider, id, transaction, { message: "We couldn't find that rider." });
    const owner = await User.findByPk(rider.userId, { transaction });
    const { changes, reason } = decide(action, rider, body);
    // A suspended rider stops getting jobs at once
    if (action === 'suspend') changes.isOnline = false;
    await rider.update(changes, { transaction });
    const summary = {
      approve: `Approved ${owner.name}`,
      reject: `Rejected ${owner.name}: ${reason}`,
      suspend: `Suspended ${owner.name}: ${reason}`,
      reinstate: `Reinstated ${owner.name}`,
    }[action];
    await audit.log(
      { actor, action: `rider.${action}`, targetType: 'rider', targetId: rider.id, summary, req },
      { transaction },
    );
    await notify(
      rider.userId,
      { type: 'system', ...decisionMessage(action, 'rider', reason), link: '/rider/status' },
      { transaction },
    );
  });
  return riderDetail(id);
};
