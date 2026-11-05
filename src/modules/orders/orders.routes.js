import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requireRole, validate } from '../../core/middlewares/index.js';
import { idParams } from '../vendors/vendors.schemas.js';
import * as controller from './orders.controller.js';
import { cartBody, reasonBody, verifyBody } from './orders.schemas.js';

const customer = [authenticate, requireRole('customer')];
const vendor = [authenticate, requireRole('vendor')];
const params = validate({ params: idParams });

// POST /checkout/quote
export const checkoutRoutes = Router().post(
  '/quote',
  ...customer,
  validate({ body: cartBody }),
  asyncHandler(controller.quote),
);

// /payments/initialize and /verify (customers; the order is created by verify)
export const paymentRoutes = Router()
  .post('/initialize', ...customer, validate({ body: cartBody }), asyncHandler(controller.initializePayment))
  .post('/verify', ...customer, validate({ body: verifyBody }), asyncHandler(controller.verifyPayment));

// GET /me/payments
export const mePaymentRoutes = Router().get('/payments', ...customer, asyncHandler(controller.myPayments));

// /orders: scoped reads, the customer's cancel and the vendor's moves
const orderRoutes = Router();
orderRoutes.get('/', authenticate, asyncHandler(controller.listOrders));
orderRoutes.get('/:id', authenticate, params, asyncHandler(controller.getOrder));
orderRoutes.post(
  '/:id/cancel',
  ...customer,
  validate({ params: idParams, body: reasonBody }),
  asyncHandler(controller.cancelOrder),
);
for (const action of ['accept', 'preparing', 'ready']) {
  orderRoutes.post(`/:id/${action}`, ...vendor, params, asyncHandler(controller.vendorMove(action)));
}
orderRoutes.post(
  '/:id/reject',
  ...vendor,
  validate({ params: idParams, body: reasonBody }),
  asyncHandler(controller.rejectOrder),
);
export default orderRoutes;

// /vendor/stats, /vendor/sales, /vendor/sales/daily (behind the /vendor router's auth)
export const vendorSalesRoutes = Router()
  .get('/stats', asyncHandler(controller.stats))
  .get('/sales', asyncHandler(controller.vendorSales))
  .get('/sales/daily', asyncHandler(controller.dailySales));
