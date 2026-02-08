import type { Context, Next } from 'hono';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../config/redis.js';
import { RateLimitError } from '../utils/errors.js';

/**
 * Tier-based rate limit configurations.
 * Sliding window algorithm for smooth rate limiting.
 */

type RateLimitTier = 'unauth' | 'free' | 'pro' | 'premium';
type RateLimitCategory = 'read' | 'write' | 'auth';

interface RateLimitConfig {
  requests: number;
  window: string;
}

const RATE_LIMITS: Record<RateLimitTier, Record<RateLimitCategory, RateLimitConfig>> = {
  unauth: {
    read: { requests: 5, window: '1 m' },
    write: { requests: 5, window: '1 m' },
    auth: { requests: 5, window: '1 m' },
  },
  free: {
    read: { requests: 60, window: '1 m' },
    write: { requests: 30, window: '1 m' },
    auth: { requests: 10, window: '1 m' },
  },
  pro: {
    read: { requests: 120, window: '1 m' },
    write: { requests: 60, window: '1 m' },
    auth: { requests: 10, window: '1 m' },
  },
  premium: {
    read: { requests: 300, window: '1 m' },
    write: { requests: 120, window: '1 m' },
    auth: { requests: 10, window: '1 m' },
  },
};

/**
 * Cache of Ratelimit instances keyed by "tier:category".
 * Created lazily on first use.
 */
const rateLimiters = new Map<string, Ratelimit>();

function getRateLimiter(tier: RateLimitTier, category: RateLimitCategory): Ratelimit | null {
  if (!redis) return null;

  const key = `${tier}:${category}`;
  let limiter = rateLimiters.get(key);
  if (limiter) return limiter;

  const config = RATE_LIMITS[tier][category];
  limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.requests, config.window as `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`),
    prefix: `ratelimit:${key}`,
  });
  rateLimiters.set(key, limiter);
  return limiter;
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
  const limiter = getRateLimiter(tier, category);

  if (!limiter) {
    await next();
    return;
  }

  const identifier = getIdentifier(c);

  try {
    const result = await limiter.limit(identifier);

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
  const limiter = getRateLimiter(tier, 'auth');

  if (!limiter) {
    await next();
    return;
  }

  const identifier = getIdentifier(c);

  try {
    const result = await limiter.limit(identifier);

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
