import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * Redis client using ioredis (standard TCP driver).
 *
 * Works with both:
 * - Local Docker Redis (redis://localhost:6379)
 * - Upstash Redis TCP endpoint (rediss://default:xxx@xxx.upstash.io:6379)
 *
 * Gracefully handles missing configuration in development mode.
 */
export let redis: Redis | null = null;

if (env.REDIS_URL) {
  try {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    redis.on('connect', () => {
      console.log('✅ Redis client connected');
    });

    redis.on('error', (err: Error) => {
      console.error('❌ Redis connection error:', err.message);
    });
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
    console.error('💥 REDIS_URL is required in production. Exiting...');
    process.exit(1);
  } else {
    console.warn('⚠️  Redis configuration missing. Caching and rate limiting disabled in development.');
  }
}
