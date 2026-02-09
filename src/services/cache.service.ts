import { redis } from '../config/redis.js';

/**
 * Cache service providing get/set/del operations with TTL support.
 * Uses ioredis (standard Redis TCP driver) - works with both local Docker
 * Redis and Upstash TCP endpoint.
 *
 * Values are JSON-serialized for storage and deserialized on retrieval.
 * Gracefully degrades when Redis is unavailable (development mode).
 */

/**
 * Get a value from the cache.
 * Returns null if key doesn't exist or Redis is unavailable.
 */
export async function get<T = unknown>(key: string): Promise<T | null> {
  if (!redis) {
    return null;
  }

  try {
    const value = await redis.get(key);
    if (value === null) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Cache get error for key "${key}":`, error);
    return null;
  }
}

/**
 * Set a value in the cache with optional TTL (time-to-live) in seconds.
 * If TTL is not provided, the key will not expire.
 * Returns true if successful, false otherwise.
 */
export async function set<T = unknown>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> {
  if (!redis) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds !== undefined) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
    return true;
  } catch (error) {
    console.error(`Cache set error for key "${key}":`, error);
    return false;
  }
}

/**
 * Delete a value from the cache.
 * Returns true if the key was deleted, false otherwise.
 */
export async function del(key: string): Promise<boolean> {
  if (!redis) {
    return false;
  }

  try {
    const result = await redis.del(key);
    return result > 0;
  } catch (error) {
    console.error(`Cache del error for key "${key}":`, error);
    return false;
  }
}

/**
 * Delete multiple keys from the cache.
 * Returns the number of keys that were deleted.
 */
export async function delMany(keys: string[]): Promise<number> {
  if (!redis || keys.length === 0) {
    return 0;
  }

  try {
    const result = await redis.del(...keys);
    return result;
  } catch (error) {
    console.error(`Cache delMany error for keys:`, keys, error);
    return 0;
  }
}

/**
 * Check if a key exists in the cache.
 * Returns true if the key exists, false otherwise.
 */
export async function exists(key: string): Promise<boolean> {
  if (!redis) {
    return false;
  }

  try {
    const result = await redis.exists(key);
    return result > 0;
  } catch (error) {
    console.error(`Cache exists error for key "${key}":`, error);
    return false;
  }
}

/**
 * Get the TTL (time-to-live) of a key in seconds.
 * Returns -1 if the key has no expiry, -2 if it doesn't exist, or null on error.
 */
export async function ttl(key: string): Promise<number | null> {
  if (!redis) {
    return null;
  }

  try {
    const result = await redis.ttl(key);
    return result;
  } catch (error) {
    console.error(`Cache ttl error for key "${key}":`, error);
    return null;
  }
}
