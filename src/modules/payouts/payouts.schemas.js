import { z } from 'zod';

// Length is checked after trimming in the service (422 on reference)
export const markPaidBody = z.object({ reference: z.string({ error: 'Enter the bank transfer reference' }).max(200) });
