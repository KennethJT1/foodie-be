import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { authenticate, validate } from '../../core/middlewares/index.js';
import * as controller from './uploads.controller.js';
import { uploadBody } from './uploads.schemas.js';
import { parseUpload } from './uploads.middleware.js';

// Mounted at /uploads. Multipart is parsed after authenticate, so anonymous requests are refused
// before any file is read into memory.
const router = Router();

router.post('/', authenticate, parseUpload, validate({ body: uploadBody }), asyncHandler(controller.create));

export default router;
