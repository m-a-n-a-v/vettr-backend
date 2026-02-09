import type { Context, Next } from 'hono';
import { redis, upstashRedis, redisMode } from '../config/redis.js';
import { RateLimitError } from '../utils/errors.js';

/**
 * Tier-based rate limit configurations.
 * Sliding window algorithm for smooth rate limiting.
 *
 * Dual-mode:
 * - ioredis: Uses sorted sets for sliding window (local Redis)
 * - Upstash REST: Uses Upstash's built-in script evaluation
 */

type RateLimitTier = 'unauth' | 'free' | 'pro' | 'premium';
type RateLimitCategory = 'read' | 'write' | 'auth';

interface RateLimitConfig {
  requests: number;
  windowMs: number;
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

async function checkRateLimitIORedis(
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

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);
  pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
  pipeline.expire(key, Math.ceil(config.windowMs / 1000));

  const results = await pipeline.exec();
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

async function checkRateLimitUpstash(
  identifier: string,
  tier: RateLimitTier,
  category: RateLimitCategory
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  if (!upstashRedis) {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }

  const config = RATE_LIMITS[tier][category];
  const key = `ratelimit:${tier}:${category}:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Use Upstash pipeline
  const pipeline = upstashRedis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);
  pipeline.zadd(key, { score: now, member: `${now}:${Math.random().toString(36).slice(2)}` });
  pipeline.expire(key, Math.ceil(config.windowMs / 1000));

  const results = await pipeline.exec();
  const currentCount = (results?.[1] as number) || 0;
  const remaining = Math.max(0, config.requests - currentCount - 1);
  const reset = now + config.windowMs;

  return {
    success: currentCount < config.requests,
    limit: config.requests,
    remaining,
    reset,
  };
}

async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier,
  category: RateLimitCategory
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  if (redisMode === 'upstash') {
    return checkRateLimitUpstash(identifier, tier, category);
  }
  if (redisMode === 'ioredis') {
    return checkRateLimitIORedis(identifier, tier, category);
  }
  return { success: true, limit: 0, remaining: 0, reset: 0 };
}

function getCategoryFromMethod(method: string): RateLimitCategory {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return 'read';
  }
  return 'write';
}

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
    // user not set in context
  }
  return 'unauth';
}

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

export async function rateLimitMiddleware(c: Context, next: Next): Promise<void> {
  if (redisMode === 'none') {
    await next();
    return;
  }

  // Bypass rate limiting for admin routes (authenticated via X-Admin-Secret)
  const adminSecret = c.req.header('x-admin-secret');
  if (adminSecret && c.req.path.includes('/admin')) {
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
    console.warn('⚠️  Rate limiting check failed, allowing request:', error);
  }

  await next();
}

export async function authRateLimitMiddleware(c: Context, next: Next): Promise<void> {
  if (redisMode === 'none') {
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
