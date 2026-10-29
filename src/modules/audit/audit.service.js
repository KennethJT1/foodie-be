import { buildListQuery, paginate } from '../../core/query/index.js';
import { models } from '../../db/index.js';

// GET /admin/audit-log (handoff section 3): search summary, actor, action, target id;
// filters actorRole, targetType, action (prefix); newest first
const LIST_CONFIG = {
  searchFields: ['summary', 'actorName', 'action', 'targetId'],
  filters: {
    actorRole: 'actorRole',
    targetType: 'targetType',
    action: { field: 'action', op: 'prefix' },
  },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt' },
};

const toEntry = (e) => ({
  id: e.id,
  actorName: e.actorName,
  actorRole: e.actorRole,
  action: e.action,
  targetType: e.targetType,
  targetId: e.targetId,
  summary: e.summary,
  ip: e.ip,
  createdAt: e.createdAt.toISOString(),
});

export const listAuditLog = async (query) => {
  const { data, meta } = await paginate(models.AuditLog, buildListQuery(query, LIST_CONFIG));
  return { data: data.map(toEntry), meta };
};
