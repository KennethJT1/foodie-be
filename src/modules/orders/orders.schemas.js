import { z } from 'zod';

// Carts are checked against the menu in the pricing service (422 with the quote codes)
export const cartBody = z.looseObject({});

export const verifyBody = z.object({
  reference: z.string({ error: 'Missing payment reference' }).trim().min(1, 'Missing payment reference').max(64),
});

export const reasonBody = z.looseObject({ reason: z.string().max(500, 'Keep it under 200 characters').optional() });

export const customerStatusBody = z.object({
  status: z.enum(['active', 'suspended', 'banned'], { error: 'Pick a status' }),
  reason: z.string().max(500).optional(),
});

export const reconcileBody = z.object({
  note: z.string({ error: 'Say how you checked it' }).trim().min(1, 'Say how you checked it').max(500),
});
