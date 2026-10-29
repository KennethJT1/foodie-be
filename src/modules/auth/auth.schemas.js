import { z } from 'zod';

const password = z
  .string({ error: 'Enter a password' })
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');
const name = (label) =>
  z
    .string({ error: `Enter your ${label}` })
    .trim()
    .min(1, `Enter your ${label}`)
    .max(60, `Keep your ${label} under 60 characters`);
const phone = z.string({ error: 'Enter your phone number' }).trim().min(1, 'Enter your phone number');
const email = z.email({ error: 'Enter a valid email address' }).max(191);

export const registerBody = z.object({
  role: z.enum(['customer', 'vendor', 'rider'], { error: 'Pick how you want to use KJT Foodie.' }),
  firstName: name('first name'),
  lastName: name('last name'),
  email: z.union([email, z.literal('')]).optional(),
  phone,
  password,
});

export const loginBody = z.object({
  email: z.string({ error: 'Enter your email' }).trim().min(1, 'Enter your email'),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password'),
});

export const otpRequestBody = z.object({
  phone,
  purpose: z.enum(['login', 'verify', 'reset']).optional(),
});

export const otpVerifyBody = z.object({
  phone,
  code: z.string({ error: 'Enter the 6-digit code' }).regex(/^\d{6}$/, 'Enter the 6-digit code'),
  purpose: z.enum(['login', 'verify', 'reset']).optional(),
});

export const googleBody = z.object({
  credential: z
    .string({ error: 'Google sign-in failed. Please try again.' })
    .min(10, 'Google sign-in failed. Please try again.'),
});

export const forgotBody = z.object({
  identifier: z.string({ error: 'Enter your email or phone number' }).trim().min(1, 'Enter your email or phone number'),
});

export const resetBody = z.object({
  identifier: z.string({ error: 'Enter your email or phone number' }).trim().min(1, 'Enter your email or phone number'),
  code: z.string({ error: 'Enter the code we sent you' }).trim().min(1, 'Enter the code we sent you'),
  password,
});
