import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import * as controller from './payouts.controller.js';

// /rider/trips, /rider/earnings, /rider/statements (behind the /rider router's auth)
export const riderMoneyRoutes = Router()
  .get('/trips', asyncHandler(controller.listTrips))
  .get('/earnings', asyncHandler(controller.earnings))
  .get('/statements', asyncHandler(controller.listStatements));
