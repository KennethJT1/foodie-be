// What the signed-in user liked and follows, for isLiked / isFollowing on a page of dishes / stores
import { models } from '../../db/index.js';

export const personalFor = async (user, { vendorIds = [], foodItemIds = [] } = {}) => {
  if (!user) return { likedIds: new Set(), followedIds: new Set() };
  const [likes, follows] = await Promise.all([
    foodItemIds.length
      ? models.Like.findAll({ where: { userId: user.id, foodItemId: foodItemIds }, attributes: ['foodItemId'] })
      : [],
    vendorIds.length
      ? models.Follow.findAll({
          where: { userId: user.id, vendorId: [...new Set(vendorIds)] },
          attributes: ['vendorId'],
        })
      : [],
  ]);
  return { likedIds: new Set(likes.map((l) => l.foodItemId)), followedIds: new Set(follows.map((f) => f.vendorId)) };
};
