import { models } from '../../db/index.js';

/**
 * Records an admin decision or money event (handoff section 6 "Audit log"). Pass the caller's
 * transaction so the entry rolls back with the change it describes. `actor` is the acting user,
 * or null for the system (jobs, webhooks).
 *
 *   await audit.log({ actor: req.user, action: 'role.updated', targetType: 'role', targetId: 'support',
 *     summary: 'support: +orders.view −none', req }, { transaction });
 */
export const audit = {
  log: ({ actor, action, targetType, targetId, summary, req }, { transaction } = {}) =>
    models.AuditLog.create(
      {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? 'System',
        actorRole: actor ? (actor.adminRole ?? actor.role) : 'system',
        action,
        targetType,
        targetId: String(targetId),
        summary: summary.slice(0, 500),
        ip: req?.ip ?? null,
      },
      { transaction },
    ),
};
