// Ratings after delivery (FR-SOC-06): the customer rates the vendor and the rider of a delivered
// order once each; the vendor may reply once. Reference: foodie-fe src/mocks/handlers/reviews.js.
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { buildListQuery, paginate } from '../../core/query/index.js';
import { lockForUpdate, models, withTransaction } from '../../db/index.js';
import { notify } from '../notifications/notifications.service.js';

const { Order, Review, Rider, Vendor } = models;

const iso = (date) => (date ? new Date(date).toISOString() : null);

/** Review (contract): `reply` is the vendor's answer or null; `repliedAt` says when. */
export const toReviewDto = (r) => ({
  id: r.id,
  orderId: r.orderId,
  targetType: r.targetType,
  targetId: r.targetId,
  userId: r.userId,
  userName: r.userName,
  rating: r.rating,
  comment: r.comment,
  reply: r.reply ?? null,
  repliedAt: iso(r.repliedAt),
  createdAt: iso(r.createdAt),
});

// GET /reviews (handoff section 3): search comment and reviewer name; newest first
const LIST_CONFIG = {
  searchFields: ['comment', 'userName'],
  filters: { targetType: 'targetType', targetId: 'targetId', rating: { field: 'rating', type: 'integer' } },
  defaultSort: '-createdAt',
  sortable: { createdAt: 'createdAt', rating: 'rating' },
};

export const listReviews = async (query) => {
  const { data, meta } = await paginate(Review, buildListQuery(query, LIST_CONFIG));
  return { data: data.map(toReviewDto), meta };
};

/** The new running average after one more rating, to 2 places. */
const withRating = (target, rating) => ({
  rating: Number(((target.rating * target.ratingCount + rating) / (target.ratingCount + 1)).toFixed(2)),
  ratingCount: target.ratingCount + 1,
});

const TARGETS = {
  vendor: { model: Vendor, idOf: (o) => o.vendorId, flag: 'ratedVendor' },
  rider: { model: Rider, idOf: (o) => o.riderId, flag: 'ratedRider' },
};

/**
 * POST /orders/{id}/reviews `{ targetType, rating, comment? }` (customers). Delivered orders only
 * (409), once per target (409 ALREADY_SUBMITTED). Updates the target's rating and the order flag.
 */
export const createReview = async (user, orderId, { targetType, rating, comment }) => {
  const target = TARGETS[targetType];
  const text = String(comment ?? '').trim();
  if (text.length > 500) throw new ValidationError({ comment: 'Keep it under 500 characters' });

  return withTransaction(async (transaction) => {
    const order = await lockForUpdate(Order, orderId, transaction, {
      where: { customerId: user.id },
      message: "We couldn't find that order.",
    });
    if (order.status !== 'delivered') {
      throw new ConflictError('INVALID_STATUS', 'You can rate an order once it has been delivered.');
    }
    if (order[target.flag]) throw new ConflictError('ALREADY_SUBMITTED', `You've already rated this ${targetType}.`);
    const targetId = target.idOf(order);
    const row = targetId
      ? await target.model.findByPk(targetId, { transaction, lock: transaction.LOCK.UPDATE, paranoid: false })
      : null;
    if (!row) throw new NotFoundError(`We couldn't find the ${targetType} for this order.`);

    const review = await Review.create(
      { orderId: order.id, targetType, targetId, userId: user.id, userName: user.name, rating, comment: text },
      { transaction },
    );
    await row.update(withRating(row, rating), { transaction });
    await order.update({ [target.flag]: true }, { transaction, silent: true });
    if (targetType === 'vendor') {
      await notify(
        row.ownerUserId,
        {
          type: 'review',
          title: `New ${rating}-star review`,
          body: text || `${user.firstName} rated order KJT-${order.code}.`,
          link: '/vendor/engagement',
        },
        { transaction },
      );
    }
    return toReviewDto(review);
  });
};

/** POST /reviews/{id}/reply `{ body }`: the vendor answers a review of their store once (409 after). */
export const replyToReview = async (user, reviewId, { body }) => {
  const text = String(body ?? '').trim();
  if (!text) throw new ValidationError({ body: 'Write a reply first' });
  if (text.length > 500) throw new ValidationError({ body: 'Keep it under 500 characters' });

  return withTransaction(async (transaction) => {
    const vendor = await Vendor.findOne({ where: { ownerUserId: user.id }, attributes: ['id'], transaction });
    const review = await lockForUpdate(Review, reviewId, transaction, {
      where: { targetType: 'vendor', targetId: vendor?.id ?? '' },
      message: "We couldn't find that review.",
    });
    if (review.reply) throw new ConflictError('ALREADY_SUBMITTED', 'You have already replied to this review.');
    await review.update({ reply: text, repliedAt: new Date() }, { transaction });
    await notify(
      review.userId,
      {
        type: 'review',
        title: 'The vendor replied to your review',
        body: text.slice(0, 80),
        link: `/account/orders/${review.orderId}`,
      },
      { transaction },
    );
    return toReviewDto(review);
  });
};
