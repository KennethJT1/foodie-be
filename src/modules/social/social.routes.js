import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, optionalAuth, requireRole, validate } from '../../core/middlewares/index.js';
import { idParams } from '../vendors/vendors.schemas.js';
import * as controller from './social.controller.js';
import { commentBody, reportBody } from './social.schemas.js';

// Likes, comments, follows, reports and the feed. Each router is mounted beside the catalogue's.
const customer = [authenticate, requireRole('customer')];
const params = validate({ params: idParams });

export const feedRoutes = Router().get('/', optionalAuth, asyncHandler(controller.feed));

// /food-items/{id}/likes and /comments
export const foodItemSocialRoutes = Router()
  .post('/:id/likes', ...customer, params, asyncHandler(controller.like))
  .delete('/:id/likes', ...customer, params, asyncHandler(controller.unlike))
  .get('/:id/comments', optionalAuth, params, asyncHandler(controller.listComments))
  .post(
    '/:id/comments',
    authenticate,
    requireRole('customer', 'vendor'),
    validate({ params: idParams, body: commentBody }),
    asyncHandler(controller.addComment),
  );

export const commentRoutes = Router()
  .patch('/:id', authenticate, validate({ params: idParams, body: commentBody }), asyncHandler(controller.editComment))
  .delete('/:id', authenticate, params, asyncHandler(controller.deleteComment));

export const reportRoutes = Router().post(
  '/',
  authenticate,
  validate({ body: reportBody }),
  asyncHandler(controller.report),
);

// /vendors/{id}/follow
export const vendorFollowRoutes = Router()
  .post('/:id/follow', ...customer, params, asyncHandler(controller.follow))
  .delete('/:id/follow', ...customer, params, asyncHandler(controller.unfollow));

// /me/likes and /me/follows
export const meSocialRoutes = Router()
  .get('/likes', ...customer, asyncHandler(controller.myLikes))
  .get('/follows', ...customer, asyncHandler(controller.myFollows));

// /vendor/engagement and /vendor/comments (behind the /vendor router's auth)
export const vendorSocialRoutes = Router()
  .get('/engagement', asyncHandler(controller.engagement))
  .get('/comments', asyncHandler(controller.vendorComments));
