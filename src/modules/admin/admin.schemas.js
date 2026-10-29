import { z } from 'zod';
import { ADMIN_ROLES } from '../../core/auth/index.js';

const name = (label) =>
  z
    .string({ error: `Enter their ${label}` })
    .trim()
    .min(2, `Enter their ${label}`)
    .max(40, `Keep it under 40 characters`);

const adminRole = z.enum(ADMIN_ROLES, { error: 'Pick a role' });

export const idParams = z.object({ id: z.string().min(1).max(64) });

export const createAdminBody = z.object({
  firstName: name('first name'),
  lastName: name('last name'),
  email: z
    .string({ error: 'Enter a valid email address' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address' }).max(191)),
  adminRole,
});

export const updateAdminBody = z.object({
  adminRole: adminRole.optional(),
  status: z.enum(['active', 'suspended'], { error: 'Pick a status' }).optional(),
});

export const updateRoleBody = z.object({
  permissions: z.array(z.string(), { error: 'Pick permissions from the list' }),
});
