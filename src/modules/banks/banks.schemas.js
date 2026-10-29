import { z } from 'zod';

export const resolveBody = z.object({
  bankCode: z.string({ error: 'Pick your bank' }).trim().min(1, 'Pick your bank').max(20, 'Pick your bank'),
  accountNumber: z
    .string({ error: 'Enter the 10-digit account number' })
    .trim()
    .regex(/^\d{10}$/, 'Enter the 10-digit account number'),
});
