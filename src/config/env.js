import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.url(),
  TZ: z.string().default('Africa/Lagos'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Comma-separated frontend origins allowed by CORS: dev server, Playwright, vite preview
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174,http://localhost:4173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_NAME_TEST: z.string().min(1).optional(),
  DB_USER: z.string().min(1),
  DB_PASS: z.string(),
  DB_SSL: z.stringbool().default(false),
  DB_LOGGING: z.stringbool().default(false),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).default('kjt-foodie'),

  // redis:// locally, rediss:// (TLS) for managed Redis
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'Must start with redis:// or rediss://'),
  // Namespaces every key (queues, rate limits, cache) so dev and test can share one Redis.
  // Defaults to kjt:<NODE_ENV>
  REDIS_KEY_PREFIX: z.string().min(1).optional(),

  // SMS goes out only in production; elsewhere it is logged (demo OTP is 123456)
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().min(1).default('KJTFoodie'),
  TERMII_BASE_URL: z.url().default('https://api.ng.termii.com'),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default('KJT Foodie <no-reply@kjtfoodie.com>'),
});

const parsed = envSchema.safeParse(process.env);

// Refuse to boot with a missing or invalid variable
if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
