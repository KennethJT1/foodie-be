import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requireRole, validate } from '../../core/middlewares/index.js';
import { idParams } from '../vendors/vendors.schemas.js';
import * as controller from './deliveries.controller.js';
import { chatBody, completeBody, statusBody } from './deliveries.schemas.js';

const params = validate({ params: idParams });

// /rider/status, /rider/offers, /rider/delivery (behind the /rider router's auth)
export const riderDispatchRoutes = Router()
  .post('/status', validate({ body: statusBody }), asyncHandler(controller.setStatus))
  .get('/offers', asyncHandler(controller.listOffers))
  .get('/delivery', asyncHandler(controller.currentDelivery));

// /deliveries: offers and the active job (riders)
const deliveryRoutes = Router();
deliveryRoutes.use(authenticate, requireRole('rider'));
deliveryRoutes.post('/offers/:id/accept', params, asyncHandler(controller.acceptOffer));
deliveryRoutes.post('/offers/:id/decline', params, asyncHandler(controller.declineOffer));
deliveryRoutes.post('/:id/pickup', params, asyncHandler(controller.pickup));
deliveryRoutes.post(
  '/:id/complete',
  validate({ params: idParams, body: completeBody }),
  asyncHandler(controller.complete),
);
export default deliveryRoutes;

// /orders/{id}/chat: the customer and the assigned rider
export const chatRoutes = Router()
  .get('/:id/chat', authenticate, requireRole('customer', 'rider'), params, asyncHandler(controller.getChat))
  .post(
    '/:id/chat',
    authenticate,
    requireRole('customer', 'rider'),
    validate({ params: idParams, body: chatBody }),
    asyncHandler(controller.sendMessage),
  );
