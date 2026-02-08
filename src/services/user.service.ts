import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users, userSettings } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

export type UserProfile = typeof users.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string;
}

const DEFAULT_SETTINGS: Record<string, any> = {
  notifications_enabled: true,
  push_alerts: true,
  email_alerts: false,
  dark_mode: false,
  language: 'en',
};

/**
 * Get user profile by user ID.
 * Throws NotFoundError if user doesn't exist.
 */
export async function getProfile(userId: string): Promise<UserProfile> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError(`User not found`);
  }

  return user;
}

/**
 * Update user profile fields (display_name, avatar_url).
 * Returns the updated user profile.
 * Throws NotFoundError if user doesn't exist.
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<UserProfile> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.displayName !== undefined) {
    updateData.displayName = input.displayName;
  }
  if (input.avatarUrl !== undefined) {
    updateData.avatarUrl = input.avatarUrl;
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new NotFoundError(`User not found`);
  }

  return updated;
}

/**
 * Get user settings by user ID.
 * Creates default settings on first access if none exist.
 */
export async function getSettings(userId: string): Promise<Record<string, any>> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (existing) {
    return existing.settings;
  }

  // Create default settings on first access
  const [created] = await db
    .insert(userSettings)
    .values({
      userId,
      settings: { ...DEFAULT_SETTINGS },
    })
    .returning();

  return created.settings;
}

/**
 * Update user settings by merging with existing settings.
 * Creates settings record if none exists, then merges the provided updates.
 * Returns the full merged settings object.
 */
export async function updateSettings(
  userId: string,
  settings: Record<string, any>,
): Promise<Record<string, any>> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Get existing settings (or create defaults)
  const currentSettings = await getSettings(userId);

  // Merge new settings into existing
  const mergedSettings = { ...currentSettings, ...settings };

  const [updated] = await db
    .update(userSettings)
    .set({
      settings: mergedSettings,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId))
    .returning();

  return updated.settings;
}
