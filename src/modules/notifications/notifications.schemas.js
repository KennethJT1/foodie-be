import { z } from 'zod';

export const notificationIdParams = z.object({ id: z.string().min(1).max(64) });
