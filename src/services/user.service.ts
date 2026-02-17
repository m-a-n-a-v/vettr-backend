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
  alert_preferences: {
    red_flag: true,
    financing: true,
    drill_result: true,
    management_change: true,
  },
  theme: 'dark',
  default_sort_order: 'vetr_score',
  // Legacy fields kept for backward compatibility (iOS/Android)
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
/**
 * Deep merge that fills in missing keys from defaults into existing settings.
 * For nested objects (like alert_preferences), merges recursively so
 * existing user values are preserved while missing keys get defaults.
 */
function deepMergeDefaults(existing: Record<string, any>, defaults: Record<string, any>): Record<string, any> {
  const result = { ...existing };
  for (const key of Object.keys(defaults)) {
    if (result[key] === undefined) {
      result[key] = defaults[key];
    } else if (
      typeof defaults[key] === 'object' &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMergeDefaults(result[key], defaults[key]);
    }
  }
  return result;
}

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
    // Backfill any missing fields from defaults for existing users
    // (e.g. old users missing alert_preferences, theme, default_sort_order)
    return deepMergeDefaults(existing.settings, DEFAULT_SETTINGS);
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

  // Get existing settings (or create defaults, already backfilled with defaults)
  const currentSettings = await getSettings(userId);

  // Deep merge: for nested objects like alert_preferences, merge individually
  // so partial updates (e.g. { alert_preferences: { red_flag: false } }) don't
  // overwrite the entire alert_preferences object
  const mergedSettings = deepMergeDefaults(settings, currentSettings);
  // Override top-level keys from incoming settings (deep merge only fills missing)
  for (const key of Object.keys(settings)) {
    if (
      typeof settings[key] === 'object' &&
      settings[key] !== null &&
      !Array.isArray(settings[key]) &&
      typeof currentSettings[key] === 'object' &&
      currentSettings[key] !== null &&
      !Array.isArray(currentSettings[key])
    ) {
      // For nested objects, merge incoming into current
      mergedSettings[key] = { ...currentSettings[key], ...settings[key] };
    } else {
      mergedSettings[key] = settings[key];
    }
  }

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
