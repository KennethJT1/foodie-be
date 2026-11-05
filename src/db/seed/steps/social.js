// Likes, follows, comments and reports (handoff 8.4): each customer likes 2–25 dishes and follows
// 0–6 stores (counts padded so the feed looks lively); 0–5 comments per dish, 35% with a vendor
// reply; 9 comment reports and 3 dish reports open.
import { models, newId } from '../../index.js';
import { COMMENT_LINES, COMMENT_REPORT_REASONS, DISH_REPORT_REASONS, VENDOR_REPLIES } from '../data/catalogue.js';

const { Comment, FoodItem, Follow, Like, Report, User, Vendor } = models;
const HOUR = 60 * 60 * 1000;

export const social = async ({ transaction, faker, now }) => {
  const customers = await User.findAll({
    where: { role: 'customer' },
    attributes: ['id'],
    order: [['id', 'ASC']],
    transaction,
  });
  const items = await FoodItem.findAll({ attributes: ['id', 'vendorId'], order: [['id', 'ASC']], transaction });
  const vendors = await Vendor.findAll({
    where: { approvalStatus: 'approved' },
    attributes: ['id', 'ownerUserId'],
    order: [['id', 'ASC']],
    transaction,
  });
  const ownerOf = new Map(vendors.map((v) => [v.id, v.ownerUserId]));
  const likesCount = new Map(items.map((f) => [f.id, 0]));
  const commentsCount = new Map(items.map((f) => [f.id, 0]));
  const followersCount = new Map(vendors.map((v) => [v.id, 0]));

  const likes = [];
  const follows = [];
  for (const c of customers) {
    for (const f of faker.helpers.arrayElements(items, faker.number.int({ min: 2, max: 25 }))) {
      likes.push({ userId: c.id, foodItemId: f.id, createdAt: faker.date.recent({ days: 60, refDate: now }) });
      likesCount.set(f.id, likesCount.get(f.id) + 1);
    }
    for (const v of faker.helpers.arrayElements(vendors, faker.number.int({ min: 0, max: 6 }))) {
      follows.push({ userId: c.id, vendorId: v.id, createdAt: faker.date.recent({ days: 90, refDate: now }) });
      followersCount.set(v.id, followersCount.get(v.id) + 1);
    }
  }

  const comments = [];
  for (const f of items) {
    for (let i = faker.number.int({ min: 0, max: 5 }); i > 0; i -= 1) {
      const createdAt = faker.date.recent({ days: 30, refDate: now });
      const comment = {
        id: newId(),
        foodItemId: f.id,
        userId: faker.helpers.arrayElement(customers).id,
        body: faker.helpers.arrayElement(COMMENT_LINES),
        createdAt,
        updatedAt: createdAt,
      };
      comments.push(comment);
      commentsCount.set(f.id, commentsCount.get(f.id) + 1);
      if (faker.datatype.boolean(0.35)) {
        const at = new Date(createdAt.getTime() + HOUR);
        comments.push({
          id: newId(),
          foodItemId: f.id,
          userId: ownerOf.get(f.vendorId),
          parentId: comment.id,
          isVendorReply: true,
          body: faker.helpers.arrayElement(VENDOR_REPLIES),
          createdAt: at,
          updatedAt: at,
        });
        commentsCount.set(f.id, commentsCount.get(f.id) + 1);
      }
    }
  }

  const reports = [
    ...faker.helpers
      .arrayElements(
        comments.filter((c) => !c.parentId),
        9,
      )
      .map((c) => ({
        targetType: 'comment',
        targetId: c.id,
        reason: faker.helpers.arrayElement(COMMENT_REPORT_REASONS),
      })),
    ...faker.helpers.arrayElements(items, 3).map((f) => ({
      targetType: 'food_item',
      targetId: f.id,
      reason: faker.helpers.arrayElement(DISH_REPORT_REASONS),
    })),
  ].map((r) => ({
    ...r,
    reporterId: faker.helpers.arrayElement(customers).id,
    createdAt: new Date(now - faker.number.int({ min: 1, max: 5 * 24 }) * HOUR),
  }));

  await Like.bulkCreate(likes, { transaction });
  await Follow.bulkCreate(follows, { transaction });
  await Comment.bulkCreate(comments, { transaction });
  await Report.bulkCreate(reports, { transaction });

  // Counters, padded so the feed looks lively (handoff 8.4). One statement per table.
  const padLikes = items.map((f) => [f.id, likesCount.get(f.id) + faker.number.int({ min: 0, max: 180 })]);
  const padFollowers = vendors.map((v) => [v.id, followersCount.get(v.id) + faker.number.int({ min: 10, max: 1500 })]);
  const caseSql = (pairs, column) =>
    `CASE id ${pairs.map(([id, n]) => `WHEN ${FoodItem.sequelize.escape(id)} THEN ${Number(n)}`).join(' ')} ELSE ${column} END`;
  await FoodItem.update(
    {
      likesCount: FoodItem.sequelize.literal(caseSql(padLikes, 'likes_count')),
      commentsCount: FoodItem.sequelize.literal(caseSql([...commentsCount], 'comments_count')),
    },
    { where: { id: items.map((f) => f.id) }, transaction },
  );
  await Vendor.update(
    { followersCount: Vendor.sequelize.literal(caseSql(padFollowers, 'followers_count')) },
    { where: { id: vendors.map((v) => v.id) }, transaction },
  );
};
