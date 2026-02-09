import { redis, upstashRedis, redisMode } from '../config/redis.js';

/**
 * Cache service with dual-mode Redis support:
 * - ioredis (TCP): Values JSON-serialized manually
 * - Upstash REST: Values auto-serialized by the client
 *
 * Gracefully degrades when Redis is unavailable.
 */

export async function get<T = unknown>(key: string): Promise<T | null> {
  try {
    if (redisMode === 'upstash' && upstashRedis) {
      return await upstashRedis.get<T>(key);
    }
    if (redisMode === 'ioredis' && redis) {
      const value = await redis.get(key);
      if (value === null) return null;
      return JSON.parse(value) as T;
    }
    return null;
  } catch (error) {
    console.error(`Cache get error for key "${key}":`, error);
    return null;
  }
}

export async function set<T = unknown>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> {
  try {
    if (redisMode === 'upstash' && upstashRedis) {
      if (ttlSeconds !== undefined) {
        await upstashRedis.set(key, JSON.stringify(value), { ex: ttlSeconds });
      } else {
        await upstashRedis.set(key, JSON.stringify(value));
      }
      return true;
    }
    if (redisMode === 'ioredis' && redis) {
      const serialized = JSON.stringify(value);
      if (ttlSeconds !== undefined) {
        await redis.setex(key, ttlSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Cache set error for key "${key}":`, error);
    return false;
  }
}

export async function del(key: string): Promise<boolean> {
  try {
    if (redisMode === 'upstash' && upstashRedis) {
      const result = await upstashRedis.del(key);
      return result > 0;
    }
    if (redisMode === 'ioredis' && redis) {
      const result = await redis.del(key);
      return result > 0;
    }
    return false;
  } catch (error) {
    console.error(`Cache del error for key "${key}":`, error);
    return false;
  }
}

export async function delMany(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  try {
    if (redisMode === 'upstash' && upstashRedis) {
      return await upstashRedis.del(...keys);
    }
    if (redisMode === 'ioredis' && redis) {
      return await redis.del(...keys);
    }
    return 0;
  } catch (error) {
    console.error(`Cache delMany error for keys:`, keys, error);
    return 0;
  }
}

export async function exists(key: string): Promise<boolean> {
  try {
    if (redisMode === 'upstash' && upstashRedis) {
      const result = await upstashRedis.exists(key);
      return result > 0;
    }
    if (redisMode === 'ioredis' && redis) {
      const result = await redis.exists(key);
      return result > 0;
    }
    return false;
  } catch (error) {
    console.error(`Cache exists error for key "${key}":`, error);
    return false;
  }
}

export async function ttl(key: string): Promise<number | null> {
  try {
    if (redisMode === 'upstash' && upstashRedis) {
      return await upstashRedis.ttl(key);
    }
    if (redisMode === 'ioredis' && redis) {
      return await redis.ttl(key);
    }
    return null;
  } catch (error) {
    console.error(`Cache ttl error for key "${key}":`, error);
    return null;
  }
}
