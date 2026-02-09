import { Redis as IORedis } from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';
import { env } from './env.js';

/**
 * Redis client with dual-mode support:
 * - Local/TCP: Uses ioredis (for Docker Redis via REDIS_URL)
 * - Serverless: Uses @upstash/redis REST (for Vercel via UPSTASH_REDIS_REST_URL/TOKEN)
 *
 * Auto-detected based on which env vars are present.
 * Exports a unified interface that works for both.
 */

export type RedisMode = 'ioredis' | 'upstash' | 'none';

export let redis: IORedis | null = null;
export let upstashRedis: UpstashRedis | null = null;
export let redisMode: RedisMode = 'none';

if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  // Serverless mode: use Upstash REST client
  try {
    upstashRedis = new UpstashRedis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    redisMode = 'upstash';
    console.log('✅ Redis client connected (Upstash REST)');
  } catch (error) {
    console.error('❌ Failed to initialize Upstash Redis client:', error);
    if (env.NODE_ENV === 'production') {
      console.error('💥 Redis is required in production. Exiting...');
      process.exit(1);
    }
  }
} else if (env.REDIS_URL) {
  // Local/TCP mode: use ioredis
  try {
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    redis.on('connect', () => {
      console.log('✅ Redis client connected (ioredis TCP)');
    });

    redis.on('error', (err: Error) => {
      console.error('❌ Redis connection error:', err.message);
    });

    redisMode = 'ioredis';
  } catch (error) {
    console.error('❌ Failed to initialize Redis client:', error);
    if (env.NODE_ENV === 'production') {
      console.error('💥 Redis is required in production. Exiting...');
      process.exit(1);
    } else {
      console.warn('⚠️  Redis disabled in development mode');
    }
  }
} else {
  if (env.NODE_ENV === 'production') {
    console.error('💥 Redis configuration required in production. Set REDIS_URL or UPSTASH_REDIS_REST_URL+TOKEN. Exiting...');
    process.exit(1);
  } else {
    console.warn('⚠️  Redis configuration missing. Caching and rate limiting disabled in development.');
  }
}

/**
 * Helper: check if any Redis client is available
 */
export function isRedisAvailable(): boolean {
  return redisMode !== 'none';
}
