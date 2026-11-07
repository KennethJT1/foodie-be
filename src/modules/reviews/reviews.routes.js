import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requireRole, validate } from '../../core/middlewares/index.js';
import { idParams } from '../vendors/vendors.schemas.js';
import * as controller from './reviews.controller.js';
import { replyBody, reviewBody } from './reviews.schemas.js';

// /reviews: public list; the vendor's reply
const reviewRoutes = Router();
reviewRoutes.get('/', asyncHandler(controller.listReviews));
reviewRoutes.post(
  '/:id/reply',
  authenticate,
  requireRole('vendor'),
  validate({ params: idParams, body: replyBody }),
  asyncHandler(controller.replyToReview),
);
export default reviewRoutes;

// POST /orders/{id}/reviews (customers)
export const orderReviewRoutes = Router().post(
  '/:id/reviews',
  authenticate,
  requireRole('customer'),
  validate({ params: idParams, body: reviewBody }),
  asyncHandler(controller.createReview),
);
