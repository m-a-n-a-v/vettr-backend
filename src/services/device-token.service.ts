import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { deviceTokens } from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';

/**
 * Register a device token for push notifications.
 * Upserts on token conflict — if the same token already exists,
 * updates the userId, platform, isActive, and updatedAt.
 */
export async function registerDevice(
  userId: string,
  platform: string,
  token: string
) {
  if (!db) throw new InternalError('Database not available');

  const result = await db
    .insert(deviceTokens)
    .values({
      userId,
      platform,
      token,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: {
        userId,
        platform,
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result[0]!;
}

/**
 * Unregister a device token (mark inactive).
 */
export async function unregisterDevice(token: string) {
  if (!db) throw new InternalError('Database not available');

  await db
    .update(deviceTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(deviceTokens.token, token));

  return { unregistered: true };
}

/**
 * Unregister all devices for a user (e.g., on logout-all).
 */
export async function unregisterAllForUser(userId: string) {
  if (!db) throw new InternalError('Database not available');

  await db
    .update(deviceTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(deviceTokens.userId, userId));

  return { unregistered: true };
}

/**
 * Get all active device tokens for a user.
 */
export async function getActiveTokensForUser(userId: string) {
  if (!db) throw new InternalError('Database not available');

  return db
    .select({
      id: deviceTokens.id,
      platform: deviceTokens.platform,
      token: deviceTokens.token,
    })
    .from(deviceTokens)
    .where(
      and(
        eq(deviceTokens.userId, userId),
        eq(deviceTokens.isActive, true)
      )
    );
}

/**
 * Mark a specific token as inactive (stale token cleanup).
 */
export async function markTokenInactive(token: string) {
  if (!db) throw new InternalError('Database not available');

  await db
    .update(deviceTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(deviceTokens.token, token));
}
