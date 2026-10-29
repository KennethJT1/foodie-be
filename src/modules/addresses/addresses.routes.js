import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, requireRole, validate } from '../../core/middlewares/index.js';
import * as controller from './addresses.controller.js';
import { addressIdParams, createAddressBody, updateAddressBody } from './addresses.schemas.js';

// Mounted at /addresses: customers' saved delivery addresses
const router = Router();

router.use(authenticate, requireRole('customer'));
router.get('/', asyncHandler(controller.list));
router.post('/', validate({ body: createAddressBody }), asyncHandler(controller.create));
router.patch('/:id', validate({ params: addressIdParams, body: updateAddressBody }), asyncHandler(controller.update));
router.delete('/:id', validate({ params: addressIdParams }), asyncHandler(controller.remove));
router.post('/:id/default', validate({ params: addressIdParams }), asyncHandler(controller.setDefault));

export default router;
