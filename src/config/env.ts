import { z } from 'zod';

const envSchema = z.object({
  // Server Configuration
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Database Configuration
  DATABASE_URL: z.string().optional(),

  // JWT Configuration
  JWT_SECRET: z.string().default('development-secret-change-in-production'),

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
  CORS_ORIGIN: z.string().default('*'),

  // Admin Configuration
  ADMIN_SECRET: z.string().optional(),

  // Cron Configuration
  CRON_SECRET: z.string().optional(),

  // Email Configuration (Resend)
  RESEND_API_KEY: z.string().optional(),

  // App URL (for password reset links)
  APP_URL: z.string().default('https://vettr-web.vercel.app'),
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
