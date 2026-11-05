// Likes, follows, comments, reports and the home feed (FR-SOC). Counters on food items and vendors
// change in the same transaction as the row. Reference: foodie-fe src/mocks/handlers/social.js and
// catalogue.js (feed).
import { literal, Op } from 'sequelize';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { cursorPaginate, pageMeta, parsePaging } from '../../core/query/index.js';
import { distanceSql } from '../../core/utils/index.js';
import { models, withTransaction } from '../../db/index.js';
import {
  originFor,
  PUBLIC_ITEM_WHERE,
  publicItemsInclude,
  serializeItems,
  serializeVendorsFor,
} from '../catalogue/catalogue.service.js';
import { notify } from '../notifications/notifications.service.js';
import { publicVendorWhere } from '../vendors/visibility.js';

const { Comment, FoodItem, Follow, Like, Report, User, Vendor } = models;

export const COMMENT_MAX = 500;
const FEED_TABS = ['nearby', 'popular', 'newest', 'following'];

/** A dish anyone may see, or 404. */
const visibleItem = async (id, { transaction, lock } = {}) => {
  const item = await FoodItem.findOne({
    where: { id, ...PUBLIC_ITEM_WHERE },
    include: publicItemsInclude(),
    transaction,
  });
  if (!item) throw new NotFoundError("We couldn't find that dish. It may have been removed.");
  if (lock) await FoodItem.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE, attributes: ['id'] });
  return item;
};

// ── Likes ────────────────────────────────────────────────────────────────────

/** POST / DELETE /food-items/{id}/likes: idempotent; { foodItemId, isLiked, likesCount }. */
export const setLike = async (user, foodItemId, liked) =>
  withTransaction(async (transaction) => {
    const item = await visibleItem(foodItemId, { transaction, lock: true });
    const existing = await Like.findOne({ where: { userId: user.id, foodItemId }, transaction });
    if (liked && !existing) {
      await Like.create({ userId: user.id, foodItemId }, { transaction });
      await FoodItem.increment('likesCount', { by: 1, where: { id: foodItemId }, transaction });
    } else if (!liked && existing) {
      await existing.destroy({ transaction });
      await FoodItem.update(
        { likesCount: literal('GREATEST(likes_count - 1, 0)') },
        { where: { id: foodItemId }, transaction },
      );
    }
    const { likesCount } = await FoodItem.findByPk(item.id, { attributes: ['likesCount'], transaction });
    return { foodItemId: item.id, isLiked: liked, likesCount };
  });

/** Page of `Model` rows the user made (newest first) whose target is still public. */
const ownPage = async (Model, user, query, include) => {
  const { page: wanted, limit } = parsePaging(query);
  const where = { userId: user.id };
  const total = await Model.count({ where, include, distinct: true, col: 'id' });
  const page = Math.min(wanted, Math.max(1, Math.ceil(total / limit)));
  const rows = total
    ? await Model.findAll({
        where,
        include,
        order: [
          ['createdAt', 'DESC'],
          ['id', 'ASC'],
        ],
        limit,
        offset: (page - 1) * limit,
      })
    : [];
  return { rows, meta: pageMeta({ page, limit, total }) };
};

/** GET /me/likes: liked dishes that are still public, latest like first. */
export const listMyLikes = async (user, query) => {
  const { rows, meta } = await ownPage(Like, user, query, [
    { model: FoodItem, as: 'foodItem', required: true, where: PUBLIC_ITEM_WHERE, include: publicItemsInclude() },
  ]);
  return {
    data: await serializeItems(
      user,
      await originFor(user, query),
      rows.map((l) => l.foodItem),
    ),
    meta,
  };
};

// ── Follows ──────────────────────────────────────────────────────────────────

/** POST / DELETE /vendors/{id}/follow: idempotent; { vendorId, isFollowing, followersCount }. */
export const setFollow = async (user, vendorId, following) =>
  withTransaction(async (transaction) => {
    const vendor = await Vendor.findOne({
      where: { id: vendorId, ...publicVendorWhere() },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!vendor) throw new NotFoundError("This store isn't available right now.");
    const existing = await Follow.findOne({ where: { userId: user.id, vendorId }, transaction });
    if (following && !existing) {
      await Follow.create({ userId: user.id, vendorId }, { transaction });
      await vendor.increment('followersCount', { by: 1, transaction });
    } else if (!following && existing) {
      await existing.destroy({ transaction });
      if (vendor.followersCount > 0) await vendor.decrement('followersCount', { by: 1, transaction });
    }
    await vendor.reload({ attributes: ['id', 'followersCount'], transaction });
    return { vendorId: vendor.id, isFollowing: following, followersCount: vendor.followersCount };
  });

/** GET /me/follows: followed stores that are still public, latest follow first. */
export const listMyFollows = async (user, query) => {
  const { rows, meta } = await ownPage(Follow, user, query, [
    { model: Vendor, as: 'vendor', required: true, where: publicVendorWhere() },
  ]);
  return {
    data: await serializeVendorsFor(
      user,
      await originFor(user, query),
      rows.map((f) => f.vendor),
    ),
    meta,
  };
};

// ── Comments ─────────────────────────────────────────────────────────────────

const authorInclude = { model: User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'avatarUrl'] };

/**
 * Comment (contract). Vendor replies show the store's name and logo. A removed or hidden comment
 * keeps its place but loses its text ("Comment removed").
 */
export const toCommentDto = (c, viewer, vendorsByOwner = new Map()) => {
  const store = c.isVendorReply ? vendorsByOwner.get(c.userId) : null;
  const gone = c.removed || c.hidden;
  return {
    id: c.id,
    foodItemId: c.foodItemId,
    parentId: c.parentId,
    body: gone ? null : c.body,
    removed: gone,
    isVendorReply: c.isVendorReply,
    author: {
      id: c.author?.id ?? null,
      name: store?.name ?? c.author?.name ?? 'KJT Foodie user',
      avatar: store?.logoUrl ?? c.author?.avatarUrl ?? null,
    },
    isMine: Boolean(viewer && viewer.id === c.userId),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
};

const storesOwnedBy = async (userIds) => {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const vendors = await Vendor.findAll({ where: { ownerUserId: ids }, attributes: ['ownerUserId', 'name', 'logoUrl'] });
  return new Map(vendors.map((v) => [v.ownerUserId, v]));
};

/** GET /food-items/{id}/comments: top-level comments newest first, each with its replies. */
export const listComments = async (user, foodItemId, query) => {
  const item = await visibleItem(foodItemId);
  const { data, meta } = await cursorPaginate(
    Comment,
    {
      where: { foodItemId, parentId: null },
      include: [authorInclude],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
    },
    query,
  );
  const replies = data.length
    ? await Comment.findAll({
        where: { parentId: data.map((c) => c.id) },
        include: [authorInclude],
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
      })
    : [];
  const stores = await storesOwnedBy(replies.filter((r) => r.isVendorReply).map((r) => r.userId));
  return {
    data: data.map((c) => ({
      ...toCommentDto(c, user, stores),
      replies: replies.filter((r) => r.parentId === c.id).map((r) => toCommentDto(r, user, stores)),
    })),
    meta: { ...meta, commentsCount: item.commentsCount },
  };
};

const readBody = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) throw new ValidationError({ body: 'Write a comment first' });
  if (text.length > COMMENT_MAX) throw new ValidationError({ body: `Keep it under ${COMMENT_MAX} characters` });
  return text;
};

/**
 * POST /food-items/{id}/comments: customers comment; the dish's vendor replies to a top-level
 * comment (parentId required). The other side is notified.
 */
export const addComment = async (user, foodItemId, { body, parentId }) =>
  withTransaction(async (transaction) => {
    const item = await visibleItem(foodItemId, { transaction, lock: true });
    const text = readBody(body);
    const isVendor = user.role === 'vendor';
    if (isVendor && item.vendor.ownerUserId !== user.id) {
      throw new ForbiddenError('FORBIDDEN', 'You can only reply to comments on your own dishes.');
    }
    if (isVendor && !parentId) {
      throw new ValidationError(
        { parentId: 'Pick the comment to reply to' },
        'Vendors can reply to comments on their own dishes.',
      );
    }
    const parent = isVendor
      ? await Comment.findOne({ where: { id: parentId, foodItemId, parentId: null }, transaction })
      : null;
    if (isVendor && !parent) throw new NotFoundError("We couldn't find that comment.");

    const comment = await Comment.create(
      { foodItemId, userId: user.id, parentId: parent?.id ?? null, isVendorReply: isVendor, body: text },
      { transaction },
    );
    await FoodItem.increment('commentsCount', { by: 1, where: { id: foodItemId }, transaction });
    if (isVendor) {
      await notify(
        parent.userId,
        {
          type: 'social',
          title: 'The vendor replied to your comment',
          body: text.slice(0, 80),
          link: `/food/${item.id}`,
        },
        { transaction },
      );
    } else {
      await notify(
        item.vendor.ownerUserId,
        {
          type: 'social',
          title: 'New comment',
          body: `${user.firstName} commented on ${item.name}.`,
          link: '/vendor/engagement',
        },
        { transaction },
      );
    }
    comment.author = user;
    const stores = isVendor ? new Map([[user.id, item.vendor]]) : new Map();
    return { ...toCommentDto(comment, user, stores), replies: [] };
  });

const ownComment = async (user, id, transaction) => {
  const comment = await Comment.findByPk(id, { include: [authorInclude], transaction, lock: transaction.LOCK.UPDATE });
  if (!comment || comment.removed) throw new NotFoundError("We couldn't find that comment.");
  if (comment.userId !== user.id) throw new ForbiddenError('FORBIDDEN', 'You can only change your own comments.');
  return comment;
};

/** PATCH /comments/{id}: the author edits; editedAt is set. */
export const editComment = async (user, id, { body }) =>
  withTransaction(async (transaction) => {
    const comment = await ownComment(user, id, transaction);
    await comment.update({ body: readBody(body), editedAt: new Date() }, { transaction });
    return toCommentDto(comment, user, await storesOwnedBy(comment.isVendorReply ? [user.id] : []));
  });

/** DELETE /comments/{id}: shown as "Comment removed" afterwards (replies stay). */
export const deleteComment = async (user, id) =>
  withTransaction(async (transaction) => {
    const comment = await ownComment(user, id, transaction);
    await comment.update({ removed: true }, { transaction });
    return { id: comment.id, removed: true };
  });

// ── Reports ──────────────────────────────────────────────────────────────────

export const toReportDto = (r) => ({
  id: r.id,
  reporterId: r.reporterId,
  targetType: r.targetType,
  targetId: r.targetId,
  reason: r.reason,
  status: r.status,
  action: r.action ?? null,
  resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

/** POST /reports: one open report per person and target (the existing one is returned). */
export const createReport = async (user, { targetType, targetId, reason }) => {
  const Target = targetType === 'comment' ? Comment : FoodItem;
  if (!(await Target.findByPk(targetId))) throw new NotFoundError("We couldn't find what you're reporting.");
  const existing = await Report.findOne({ where: { reporterId: user.id, targetType, targetId, status: 'open' } });
  if (existing) return { report: toReportDto(existing), created: false };
  const report = await Report.create({ reporterId: user.id, targetType, targetId, reason });
  return { report: toReportDto(report), created: true };
};

// ── Feed ─────────────────────────────────────────────────────────────────────

/**
 * GET /feed (cursor, limit 10): nearby = 1 km distance bands, then newest; popular = likes +
 * 2 × orders + 3 × comments; newest; following = stores the user follows, newest.
 */
export const feed = async (user, query) => {
  const tab = FEED_TABS.includes(query.tab) ? query.tab : 'nearby';
  const origin = await originFor(user, query);
  const where = {
    ...PUBLIC_ITEM_WHERE,
    ...(typeof query.categoryId === 'string' && query.categoryId && { categoryId: query.categoryId }),
  };
  if (tab === 'following') {
    const follows = user ? await Follow.findAll({ where: { userId: user.id }, attributes: ['vendorId'] }) : [];
    where.vendorId = { [Op.in]: follows.map((f) => f.vendorId) };
  }
  const newest = [
    ['createdAt', 'DESC'],
    ['id', 'ASC'],
  ];
  const order = {
    nearby: [[literal(`FLOOR(${distanceSql('`vendor`.`lat`', '`vendor`.`lng`', origin)} / 1000)`), 'ASC'], ...newest],
    popular: [
      [literal('(`FoodItem`.`likes_count` + 2 * `FoodItem`.`orders_count` + 3 * `FoodItem`.`comments_count`)'), 'DESC'],
      ...newest,
    ],
    newest,
    following: newest,
  }[tab];

  const { data, meta } = await cursorPaginate(FoodItem, { where, include: publicItemsInclude(), order }, query);
  return { data: await serializeItems(user, origin, data), meta };
};
