import { z } from 'zod';

// Comment text is checked in the service (empty / 500 characters) with the mock's messages
export const commentBody = z.looseObject({
  body: z.unknown(),
  parentId: z.string().max(64).optional(),
});

export const reportBody = z.object({
  targetType: z.enum(['comment', 'food_item'], { error: 'Pick what you are reporting' }),
  targetId: z.string({ error: 'Pick what you are reporting' }).min(1).max(64),
  reason: z.string({ error: 'Pick a reason' }).trim().min(1, 'Pick a reason').max(200, 'Keep it under 200 characters'),
});

export const resolveBody = z.object({
  action: z.enum(['hide', 'remove', 'dismiss'], { error: 'Pick an action' }),
});
