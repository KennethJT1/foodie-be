import { z } from 'zod';

// Field rules (amount up to the subtotal, lengths after trimming, own uploads) are checked in the
// service so the messages match the mock; these only keep the types sane.
export const createRefundBody = z.looseObject({
  orderId: z.string({ error: 'Pick the order' }).min(1, 'Pick the order').max(64),
  reason: z.string().max(200).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  details: z.string().max(2000).optional(),
  photos: z.array(z.string().max(1000)).optional(),
});

export const reasonBody = z.looseObject({ reason: z.string().max(2000).optional() });

export const respondBody = z.looseObject({
  decision: z.string().optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  reason: z.string().max(2000).optional(),
});

export const referenceBody = z.looseObject({ reference: z.string().max(200).optional() });

export const commentBody = z.looseObject({ body: z.string().max(5000).optional() });
