import { z } from 'zod';

export const reviewBody = z.object({
  targetType: z.enum(['vendor', 'rider'], { error: 'Say whether you are rating the vendor or the rider' }),
  rating: z.coerce
    .number({ error: 'Pick 1 to 5 stars' })
    .int('Pick 1 to 5 stars')
    .min(1, 'Pick 1 to 5 stars')
    .max(5, 'Pick 1 to 5 stars'),
  // Length is checked after trimming in the service
  comment: z.string().max(2000).optional(),
});

export const replyBody = z.object({ body: z.string({ error: 'Write a reply first' }).max(2000) });
