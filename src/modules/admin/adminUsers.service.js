import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { addJob } from '../../core/queue/index.js';
import { env } from '../../config/env.js';
import { models, withTransaction } from '../../db/index.js';
import { issueOtp } from '../auth/otp.service.js';

const { User } = models;

// GET /admin/users (handoff section 3): search name, email; filters adminRole, status; sort name
const LIST_CONFIG = {
  searchFields: ['firstName', 'lastName', 'email'],
  filters: { adminRole: 'adminRole', status: 'status' },
  defaultSort: 'name',
  sortable: {
    name: [['firstName'], ['lastName']],
    email: 'email',
    adminRole: 'adminRole',
    status: 'status',
    createdAt: 'createdAt',
  },
};

// The mock's adminRow
export const toAdminRow = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  adminRole: u.adminRole,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
});

export const listAdmins = async (query) => {
  const { data, meta } = await paginate(User, buildListQuery(query, LIST_CONFIG, { scope: { role: 'admin' } }));
  return { data: data.map(toAdminRow), meta };
};

const INVITE_TTL_SEC = 72 * 60 * 60;

/** POST /admin/users: creates the admin (no password yet) and emails a code to set one. */
export const createAdmin = async (actor, { firstName, lastName, email, adminRole }, req) => {
  if (await User.findOne({ where: { email }, paranoid: false })) {
    throw new ValidationError({ email: 'That email already has an account' });
  }

  const { user, code } = await withTransaction(async (transaction) => {
    const user = await User.create({ role: 'admin', adminRole, firstName, lastName, email }, { transaction });
    const { code } = await issueOtp({ identifier: email, purpose: 'reset', ttlSec: INVITE_TTL_SEC }, { transaction });
    await audit.log(
      {
        actor,
        action: 'admin_user.created',
        targetType: 'user',
        targetId: user.id,
        summary: `${user.name} added as ${adminRole}`,
        req,
      },
      { transaction },
    );
    return { user, code };
  });

  const link = `${env.FRONTEND_URL}/reset-password?${new URLSearchParams({ identifier: email })}`;
  await addJob('notifications', 'email.send', {
    to: email,
    subject: 'You have been added to KJT Foodie',
    text: `Hello ${firstName}, you now have ${adminRole.replace('_', ' ')} access to the KJT Foodie dashboard. Set your password at ${link} with the code ${code}. The code expires in 3 days.`,
  });
  return toAdminRow(user);
};

/** PATCH /admin/users/{id}: role and / or suspend / restore another admin. */
export const updateAdmin = async (actor, id, { adminRole, status }, req) => {
  const target = await User.findOne({ where: { id, role: 'admin' } });
  if (!target) throw new NotFoundError("We couldn't find that admin.");
  if (target.id === actor.id) throw new ConflictError('CONFLICT', "You can't change your own role or access.");

  await withTransaction(async (transaction) => {
    await target.update(
      { ...(adminRole !== undefined && { adminRole }), ...(status !== undefined && { status }) },
      { transaction },
    );
    await audit.log(
      {
        actor,
        action: 'admin_user.updated',
        targetType: 'user',
        targetId: target.id,
        summary: `${target.name}: ${[adminRole, status].filter(Boolean).join(', ')}`,
        req,
      },
      { transaction },
    );
  });
  return toAdminRow(target);
};
