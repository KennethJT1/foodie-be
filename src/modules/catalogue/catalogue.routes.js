import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { optionalAuth } from '../../core/middlewares/index.js';
import * as controller from './catalogue.controller.js';

// Public reads, mounted at the API root. A signed-in user gets isLiked / isFollowing and distances
// from their default address.
export const categoryRoutes = Router().get('/', asyncHandler(controller.listCategories));

export const foodItemRoutes = Router()
  .get('/', optionalAuth, asyncHandler(controller.listFoodItems))
  .get('/:id', optionalAuth, asyncHandler(controller.getFoodItem));

export const vendorRoutes = Router()
  .get('/', optionalAuth, asyncHandler(controller.listVendors))
  .get('/:slugOrId', optionalAuth, asyncHandler(controller.getVendor));
