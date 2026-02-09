import type { Context, Next } from 'hono';
import { redis } from '../config/redis.js';
import { RateLimitError } from '../utils/errors.js';

/**
 * Tier-based rate limit configurations.
 * Sliding window algorithm for smooth rate limiting.
 *
 * Uses ioredis directly (works with both local Redis and Upstash TCP).
 * Replaces @upstash/ratelimit with a simple sliding-window implementation.
 */

type RateLimitTier = 'unauth' | 'free' | 'pro' | 'premium';
type RateLimitCategory = 'read' | 'write' | 'auth';

interface RateLimitConfig {
  requests: number;
  windowMs: number; // window in milliseconds
}

const RATE_LIMITS: Record<RateLimitTier, Record<RateLimitCategory, RateLimitConfig>> = {
  unauth: {
    read: { requests: 5, windowMs: 60_000 },
    write: { requests: 5, windowMs: 60_000 },
    auth: { requests: 5, windowMs: 60_000 },
  },
  free: {
    read: { requests: 60, windowMs: 60_000 },
    write: { requests: 30, windowMs: 60_000 },
    auth: { requests: 10, windowMs: 60_000 },
  },
  pro: {
    read: { requests: 120, windowMs: 60_000 },
    write: { requests: 60, windowMs: 60_000 },
    auth: { requests: 10, windowMs: 60_000 },
  },
  premium: {
    read: { requests: 300, windowMs: 60_000 },
    write: { requests: 120, windowMs: 60_000 },
    auth: { requests: 10, windowMs: 60_000 },
  },
};

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Each request is stored as a member with timestamp as score.
 * Expired entries are removed, and the count of remaining entries
 * determines if the request is allowed.
 */
async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier,
  category: RateLimitCategory
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  if (!redis) {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }

  const config = RATE_LIMITS[tier][category];
  const key = `ratelimit:${tier}:${category}:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Use a pipeline for atomic operations
  const pipeline = redis.pipeline();
  // Remove expired entries outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Count current entries in window
  pipeline.zcard(key);
  // Add the current request
  pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
  // Set expiry on the key to auto-cleanup
  pipeline.expire(key, Math.ceil(config.windowMs / 1000));

  const results = await pipeline.exec();

  // results[1] is the ZCARD result: [error, count]
  const currentCount = (results?.[1]?.[1] as number) || 0;
  const remaining = Math.max(0, config.requests - currentCount - 1);
  const reset = now + config.windowMs;

  return {
    success: currentCount < config.requests,
    limit: config.requests,
    remaining,
    reset,
  };
}

/**
 * Determine the rate limit category based on HTTP method.
 */
function getCategoryFromMethod(method: string): RateLimitCategory {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return 'read';
  }
  return 'write';
}

/**
 * Determine the tier from context.
 * If user is authenticated, use their tier. Otherwise, 'unauth'.
 */
function getTierFromContext(c: Context): RateLimitTier {
  try {
    const user = c.get('user');
    if (user && user.tier) {
      const tier = user.tier.toLowerCase();
      if (tier === 'pro' || tier === 'premium' || tier === 'free') {
        return tier;
      }
      return 'free';
    }
  } catch {
    // user not set in context (unauthenticated request)
  }
  return 'unauth';
}

/**
 * Get a unique identifier for the requester.
 * Uses user ID if authenticated, otherwise falls back to IP address.
 */
function getIdentifier(c: Context): string {
  try {
    const user = c.get('user');
    if (user && user.id) {
      return `user:${user.id}`;
    }
  } catch {
    // user not set
  }
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limiting middleware for general endpoints (read/write).
 * Determines tier from auth context and category from HTTP method.
 * Gracefully skips rate limiting when Redis is unavailable.
 */
export async function rateLimitMiddleware(c: Context, next: Next): Promise<void> {
  if (!redis) {
    await next();
    return;
  }

  const tier = getTierFromContext(c);
  const category = getCategoryFromMethod(c.req.method);
  const identifier = getIdentifier(c);

  try {
    const result = await checkRateLimit(identifier, tier, category);

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.reset));

    if (!result.success) {
      const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
      c.header('Retry-After', String(Math.max(retryAfter, 1)));
      throw new RateLimitError('Rate limit exceeded. Please try again later.', {
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
        retry_after: Math.max(retryAfter, 1),
      });
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    // If rate limiting fails (Redis error), allow the request through
    console.warn('⚠️  Rate limiting check failed, allowing request:', error);
  }

  await next();
}

/**
 * Rate limiting middleware specifically for auth endpoints.
 * Uses 'auth' category with stricter limits.
 * Gracefully skips rate limiting when Redis is unavailable.
 */
export async function authRateLimitMiddleware(c: Context, next: Next): Promise<void> {
  if (!redis) {
    await next();
    return;
  }

  const tier = getTierFromContext(c);
  const identifier = getIdentifier(c);

  try {
    const result = await checkRateLimit(identifier, tier, 'auth');

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.reset));

    if (!result.success) {
      const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
      c.header('Retry-After', String(Math.max(retryAfter, 1)));
      throw new RateLimitError('Too many authentication attempts. Please try again later.', {
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
        retry_after: Math.max(retryAfter, 1),
      });
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    console.warn('⚠️  Auth rate limiting check failed, allowing request:', error);
  }

  await next();
}
