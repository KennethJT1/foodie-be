import { Router } from 'express';
import { asyncHandler } from '../../core/http/index.js';
import { receiveWebhook } from './webhook.service.js';

// Mounted at /webhooks. app.js gives /webhooks/paystack the raw body (express.raw) for the signature.
const router = Router();

router.post(
  '/paystack',
  asyncHandler(async (req, res) => {
    res.status(200).json(await receiveWebhook(req.body, req.get('x-paystack-signature')));
  }),
);

export default router;
