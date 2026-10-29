import { z } from 'zod';

const name = (label) =>
  z.string().trim().min(1, `Enter your ${label}`).max(60, `Keep your ${label} under 60 characters`);

export const updateMeBody = z.object({
  firstName: name('first name').optional(),
  lastName: name('last name').optional(),
  email: z.union([z.email({ error: 'Enter a valid email address' }).max(191), z.literal(''), z.null()]).optional(),
  // A URL returned by POST /uploads (phase 8)
  avatar: z.union([z.url({ protocol: /^https$/, error: 'Upload the photo again' }).max(500), z.null()]).optional(),
});
