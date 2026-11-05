// Vendor engagement, the vendor's comment inbox and the admin moderation queue (FR-SOC-08).
// Reference: foodie-fe src/mocks/handlers/vendor-store.js (engagement, comments) and
// admin-ops.js (reports).
import { literal, Op } from 'sequelize';
import { audit } from '../../core/audit/index.js';
import { ConflictError, NotFoundError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { models, withTransaction } from '../../db/index.js';
import { notify } from '../notifications/notifications.service.js';
import { ownVendor } from '../vendors/onboarding.service.js';

const { Comment, FoodItem, Follow, Report, User, Vendor } = models;
const DAY = 24 * 60 * 60 * 1000;

// A top-level comment the vendor has answered (a reply of theirs that wasn't removed)
const ANSWERED = literal(
  'EXISTS (SELECT 1 FROM `comments` AS `r` WHERE `r`.`parent_id` = `Comment`.`id` AND `r`.`is_vendor_reply` = 1 AND `r`.`removed` = 0)',
);

/** GET /vendor/engagement */
export const engagement = async (user) => {
  const vendor = await ownVendor(user);
  const items = await FoodItem.findAll({
    where: { vendorId: vendor.id },
    attributes: ['id', 'name', 'photos', 'likesCount'],
    order: [
      ['likesCount', 'DESC'],
      ['id', 'ASC'],
    ],
  });
  const itemIds = items.map((i) => i.id);
  const [newFollowers, recent, unanswered] = await Promise.all([
    Follow.count({ where: { vendorId: vendor.id, createdAt: { [Op.gte]: new Date(Date.now() - 30 * DAY) } } }),
    Follow.findAll({
      where: { vendorId: vendor.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['createdAt', 'DESC']],
      limit: 8,
    }),
    itemIds.length
      ? Comment.count({
          where: {
            foodItemId: itemIds,
            parentId: null,
            removed: false,
            hidden: false,
            [Op.and]: [literal(`NOT ${ANSWERED.val}`)],
          },
        })
      : 0,
  ]);
  return {
    likesCount: items.reduce((sum, i) => sum + i.likesCount, 0),
    followersCount: vendor.followersCount,
    newFollowers,
    unansweredComments: unanswered,
    rating: vendor.rating,
    ratingCount: vendor.ratingCount,
    topLiked: items
      .slice(0, 5)
      .map((i) => ({ id: i.id, name: i.name, photo: i.photos[0] ?? null, likesCount: i.likesCount })),
    recentFollowers: recent.map((f) => ({
      id: f.id,
      name: f.user?.name ?? 'Customer',
      createdAt: f.createdAt.toISOString(),
    })),
  };
};

/** GET /vendor/comments: customers' comments on the vendor's dishes; `answered=false` = waiting. */
export const vendorComments = async (user, query) => {
  const vendor = await ownVendor(user);
  const config = {
    searchFields: ['body', '$foodItem.name$', '$author.first_name$', '$author.last_name$'],
    filters: {
      answered: ([value]) =>
        value === 'true'
          ? { [Op.and]: [ANSWERED] }
          : value === 'false'
            ? { [Op.and]: [literal(`NOT ${ANSWERED.val}`)] }
            : undefined,
    },
    defaultSort: '-createdAt',
    sortable: { createdAt: 'createdAt' },
    include: [
      {
        model: FoodItem,
        as: 'foodItem',
        required: true,
        where: { vendorId: vendor.id },
        attributes: ['id', 'name', 'photos'],
        paranoid: false,
      },
      { model: User, as: 'author', attributes: ['id', 'firstName', 'lastName'] },
    ],
  };
  const listQuery = buildListQuery(query, config);
  listQuery.where = { [Op.and]: [listQuery.where, { parentId: null, removed: false, hidden: false }] };
  const { data, meta } = await paginate(Comment, listQuery);
  const replies = data.length
    ? await Comment.findAll({
        where: { parentId: data.map((c) => c.id), isVendorReply: true, removed: false },
        order: [['createdAt', 'ASC']],
      })
    : [];
  return {
    data: data.map((c) => {
      const reply = replies.find((r) => r.parentId === c.id);
      return {
        id: c.id,
        foodItemId: c.foodItem.id,
        foodItemName: c.foodItem.name,
        foodItemPhoto: c.foodItem.photos[0] ?? null,
        authorName: c.author?.name ?? 'Customer',
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        isAnswered: Boolean(reply),
        reply: reply ? { id: reply.id, body: reply.body, createdAt: reply.createdAt.toISOString() } : null,
      };
    }),
    meta,
  };
};

// ── Admin moderation ─────────────────────────────────────────────────────────

/** Previews of the reported comments and dishes for a page of reports. */
const targetsFor = async (reports) => {
  const commentIds = reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId);
  const comments = commentIds.length
    ? await Comment.findAll({
        where: { id: commentIds },
        include: [
          { model: User, as: 'author', attributes: ['id', 'firstName', 'lastName'] },
          { model: FoodItem, as: 'foodItem', attributes: ['id', 'name'], paranoid: false },
        ],
      })
    : [];
  const itemIds = reports.filter((r) => r.targetType === 'food_item').map((r) => r.targetId);
  const items = itemIds.length
    ? await FoodItem.findAll({
        where: { id: itemIds },
        include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'name'] }],
        paranoid: false,
      })
    : [];
  const map = new Map();
  for (const c of comments) {
    map.set(`comment:${c.id}`, {
      body: c.body,
      authorName: c.author?.name ?? 'Customer',
      foodItemName: c.foodItem?.name ?? '',
      foodItemId: c.foodItem?.id ?? null,
      isHidden: c.hidden,
      isRemoved: c.removed,
    });
  }
  for (const f of items) {
    map.set(`food_item:${f.id}`, {
      name: f.name,
      photo: f.photos[0] ?? null,
      vendorName: f.vendor?.name ?? '',
      foodItemId: f.id,
      isHidden: f.isHidden,
    });
  }
  return map;
};

const toReportRow = (r, targets) => ({
  id: r.id,
  targetType: r.targetType,
  targetId: r.targetId,
  reason: r.reason,
  status: r.status,
  action: r.action ?? null,
  reporterId: r.reporterId,
  reporterName: r.reporter?.name ?? 'Customer',
  resolvedBy: r.resolver?.name ?? null,
  resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
  target: targets.get(`${r.targetType}:${r.targetId}`) ?? null,
});

const REPORT_INCLUDE = [
  { model: User, as: 'reporter', attributes: ['id', 'firstName', 'lastName'] },
  { model: User, as: 'resolver', attributes: ['id', 'firstName', 'lastName'] },
];

// GET /admin/reports (handoff section 3): search reason, reporter; filters status, targetType
const REPORT_LIST = {
  searchFields: ['reason', '$reporter.first_name$', '$reporter.last_name$'],
  filters: { status: 'status', targetType: 'targetType' },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', status: 'status' },
  include: REPORT_INCLUDE,
};

export const listReports = async (query) => {
  const { data, meta } = await paginate(Report, buildListQuery(query, REPORT_LIST));
  const targets = await targetsFor(data);
  return { data: data.map((r) => toReportRow(r, targets)), meta };
};

/** POST /admin/reports/{id}/resolve: hide, remove or dismiss; settles every open report on the target. */
export const resolveReport = async (actor, id, { action }, req) => {
  await withTransaction(async (transaction) => {
    const report = await Report.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!report) throw new NotFoundError("We couldn't find that report.");
    if (report.status !== 'open') throw new ConflictError('INVALID_STATUS', 'This report has already been handled.');

    const isComment = report.targetType === 'comment';
    if (action !== 'dismiss') {
      if (isComment) {
        await Comment.update(action === 'hide' ? { hidden: true } : { removed: true }, {
          where: { id: report.targetId },
          transaction,
        });
      } else {
        const item = await FoodItem.findByPk(report.targetId, { transaction, paranoid: false });
        if (item) {
          await item.update({ isHidden: true, hiddenReason: report.reason }, { transaction });
          const vendor = await Vendor.findByPk(item.vendorId, { transaction });
          await notify(
            vendor?.ownerUserId,
            {
              type: 'system',
              title: `${item.name} was ${action === 'hide' ? 'hidden' : 'removed'}`,
              body: `People reported it: ${report.reason}. Contact support if you think this is a mistake.`,
              link: '/vendor/menu',
            },
            { transaction },
          );
        }
      }
    }
    await Report.update(
      { status: action === 'dismiss' ? 'dismissed' : 'resolved', action, resolvedBy: actor.id, resolvedAt: new Date() },
      { where: { targetType: report.targetType, targetId: report.targetId, status: 'open' }, transaction },
    );
    const verb = action === 'dismiss' ? 'report_dismissed' : action === 'hide' ? 'hidden' : 'removed';
    await audit.log(
      {
        actor,
        action: `${isComment ? 'comment' : 'food_item'}.${verb}`,
        targetType: report.targetType,
        targetId: report.targetId,
        summary: report.reason,
        req,
      },
      { transaction },
    );
  });
  const report = await Report.findByPk(id, { include: REPORT_INCLUDE });
  return toReportRow(report, await targetsFor([report]));
};
