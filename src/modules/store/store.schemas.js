import { z } from 'zod';
import { normalisePhone } from '../../core/utils/index.js';

// Menu items and store settings are validated field by field in the services (partial PATCHes)
export const looseBody = z.looseObject({});

export const staffBody = z.object({
  name: z.string({ error: "Enter the person's name" }).trim().min(2, "Enter the person's name").max(120),
  email: z
    .string({ error: 'Enter a valid email address' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address' }).max(191)),
  phone: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value?.trim()) return undefined;
      const phone = normalisePhone(value);
      if (!phone) ctx.addIssue({ code: 'custom', message: 'Enter a valid Nigerian phone number' });
      return phone ?? undefined;
    }),
  role: z.enum(['manager', 'kitchen'], { error: 'Pick a role' }),
});
