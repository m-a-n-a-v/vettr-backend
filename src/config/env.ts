import { z } from 'zod';

const envSchema = z.object({
  // Server Configuration
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Database Configuration
  DATABASE_URL: z.string().optional(),

  // JWT Configuration (legacy — kept for password-reset tokens)
  JWT_SECRET: z.string().default('development-secret-change-in-production'),

  // Clerk Configuration
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // Redis Configuration
  // Option A (local): REDIS_URL=redis://localhost:6379 (uses ioredis TCP)
  // Option B (serverless): UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (uses @upstash/redis HTTP)
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // OAuth Configuration (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),

  // CORS Configuration
  // In production, set to comma-separated list of allowed origins
  // e.g. "https://vettr.app,https://vettr.ca,https://vettr-web.vercel.app"
  CORS_ORIGIN: z.string().default('https://vettr.app,https://vettr.ca,https://vettr-web.vercel.app'),

  // Admin Configuration
  ADMIN_SECRET: z.string().optional(),

  // Cron Configuration
  CRON_SECRET: z.string().min(1, 'CRON_SECRET is required'),

  // Email Configuration (Resend)
  RESEND_API_KEY: z.string().optional(),

  // App URL (for password reset links)
  APP_URL: z.string().default('https://vettr-web.vercel.app'),

  // Firebase Configuration (for push notifications)
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();
