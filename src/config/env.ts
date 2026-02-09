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

  // Redis Configuration (standard URL, works with local Docker and Upstash TCP)
  // Local: redis://localhost:6379
  // Upstash: rediss://default:xxx@xxx.upstash.io:6379
  REDIS_URL: z.string().optional(),

  // OAuth Configuration (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),

  // CORS Configuration
  CORS_ORIGIN: z.string().default('*'),

  // Admin Configuration
  ADMIN_SECRET: z.string().optional(),
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
