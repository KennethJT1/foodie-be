import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requireRole, validate } from '../../core/middlewares/index.js';
import { idParams } from '../vendors/vendors.schemas.js';
import * as controller from './support.controller.js';
import { messageBody, ticketBody } from './support.schemas.js';

// /support/tickets: customers, vendors and riders (admins use the inbox under /admin)
const router = Router();
router.use(authenticate, requireRole('customer', 'vendor', 'rider'));
router.get('/tickets', asyncHandler(controller.listMyTickets));
router.post('/tickets', validate({ body: ticketBody }), asyncHandler(controller.createTicket));
router.get('/tickets/:id', validate({ params: idParams }), asyncHandler(controller.getMyTicket));
router.post(
  '/tickets/:id/messages',
  validate({ params: idParams, body: messageBody }),
  asyncHandler(controller.replyToMyTicket),
);
router.post('/tickets/:id/resolve', validate({ params: idParams }), asyncHandler(controller.resolveMyTicket));

export default router;
