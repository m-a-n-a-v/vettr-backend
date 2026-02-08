import { Redis } from '@upstash/redis';
import { env } from './env.js';

/**
 * Upstash Redis client for caching and rate limiting.
 * Gracefully handles missing configuration in development mode.
 */
export let redis: Redis | null = null;

if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('✅ Redis client initialized');
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
    console.error('💥 UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production. Exiting...');
    process.exit(1);
  } else {
    console.warn('⚠️  Redis configuration missing. Caching and rate limiting disabled in development.');
  }
}
