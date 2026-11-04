import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { validate } from '../../core/middlewares/index.js';
import { resolveBody } from '../banks/banks.schemas.js';
import { idParams } from '../vendors/vendors.schemas.js';
import * as controller from './store.controller.js';
import { looseBody, staffBody } from './store.schemas.js';

// The vendor's menu, store settings, bank change and staff; mounted on the /vendor router
const router = Router();

router.get('/menu', asyncHandler(controller.listMenu));
router.post('/menu', validate({ body: looseBody }), asyncHandler(controller.createMenuItem));
router.get('/menu/:id', validate({ params: idParams }), asyncHandler(controller.getMenuItem));
router.patch('/menu/:id', validate({ params: idParams, body: looseBody }), asyncHandler(controller.updateMenuItem));
router.delete('/menu/:id', validate({ params: idParams }), asyncHandler(controller.deleteMenuItem));

router.get('/store', asyncHandler(controller.getStore));
router.patch('/store', validate({ body: looseBody }), asyncHandler(controller.updateStore));
router.post('/bank-change', validate({ body: resolveBody }), asyncHandler(controller.requestBankChange));

router.get('/staff', asyncHandler(controller.listStaff));
router.post('/staff', validate({ body: staffBody }), asyncHandler(controller.addStaff));
router.delete('/staff/:id', validate({ params: idParams }), asyncHandler(controller.removeStaff));

export default router;
