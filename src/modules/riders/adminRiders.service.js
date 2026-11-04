// Admin rider review. Reference behaviour: foodie-fe src/mocks/handlers/admin.js (riderRow,
// riderDetail, decisionHandlers).
import { Op } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { NotFoundError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { notify } from '../notifications/notifications.service.js';
import { decide, decisionMessage, toDocumentDto } from '../onboarding/onboarding.shared.js';
import { bankAccountOf, documentsOf } from './onboarding.service.js';
import { toAdminRiderRow, toBankDto, toGuarantorDto } from './riders.presenter.js';

const { Rider, User } = models;

const userInclude = { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] };

// GET /admin/riders (handoff section 3): search name, phone, plate, city. `nearOrderId` arrives
// with dispatch (phase 17).
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

/** GET /admin/riders: everything but drafts. */
export const listRiders = async (query) => {
  const listQuery = buildListQuery(query, LIST_CONFIG);
  // Not a scope: a scope would drop the client's own approvalStatus filter
  listQuery.where = { [Op.and]: [listQuery.where, { approvalStatus: { [Op.ne]: 'draft' } }] };
  const { data, meta } = await paginate(Rider, listQuery);
  return { data: data.map(toAdminRiderRow), meta };
};

/** Rider detail with licence, guarantor, documents, bank and recent trips (mock `riderDetail`). */
export const riderDetail = async (id, { transaction } = {}) => {
  const rider = await Rider.findByPk(id, { include: [userInclude], transaction });
  if (!rider) throw new NotFoundError("We couldn't find that rider.");
  const [documents, bank] = await Promise.all([
    documentsOf(rider.id, { transaction }),
    bankAccountOf(rider.id, { transaction }),
  ]);
  return {
    ...toAdminRiderRow(rider),
    email: rider.user?.email ?? null,
    licenceNumber: rider.licenceNumber,
    guarantor: toGuarantorDto(rider),
    documents: documents.map(toDocumentDto),
    bank: toBankDto(bank),
    rejectionReason: rider.rejectionReason,
    suspensionReason: rider.suspensionReason,
    approvedAt: rider.approvedAt ? rider.approvedAt.toISOString() : null,
    // Delivered trips arrive with deliveries (phase 17)
    recentTrips: [],
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
