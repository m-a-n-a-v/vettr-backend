import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users, userSettings, watchlistItems, alertRules, portfolios, refreshTokens } from '../db/schema/index.js';
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
/**
 * Permanently delete a user account and anonymise their PII.
 * All linked data (portfolios, watchlist, alerts, tokens) is cascade-deleted by the DB.
 * Complies with GDPR Art. 17 (Right to Erasure) and App Store guideline 4.7.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Anonymise PII before deletion so the email slot is freed for re-registration
  const anonymisedEmail = `deleted-${userId}@vettr.invalid`;
  await db
    .update(users)
    .set({
      email: anonymisedEmail,
      displayName: 'Deleted User',
      avatarUrl: null,
      passwordHash: null,
      authProviderId: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Hard delete — cascade handles all child rows (refresh tokens, watchlist, portfolios, alerts, etc.)
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Export all data belonging to a user as a portable JSON bundle.
 * Complies with GDPR Art. 15 (Right of Access) and Art. 20 (Data Portability).
 */
export async function exportUserData(userId: string): Promise<Record<string, any>> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [profile] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!profile) {
    throw new NotFoundError('User not found');
  }

  const [settings, watchlist, userAlertRules, userPortfolios] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    db.select().from(watchlistItems).where(eq(watchlistItems.userId, userId)),
    db.select().from(alertRules).where(eq(alertRules.userId, userId)),
    db.select().from(portfolios).where(eq(portfolios.userId, userId)),
  ]);

  return {
    exported_at: new Date().toISOString(),
    profile: {
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      tier: profile.tier,
      auth_provider: profile.authProvider,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    },
    settings: settings[0]?.settings ?? null,
    watchlist,
    alert_rules: userAlertRules,
    portfolios: userPortfolios,
  };
}

export interface AcceptTermsInput {
  tos_version: string;
  accept_tos: boolean;
  accept_privacy: boolean;
}

/**
 * Record user's acceptance of Terms of Service and Privacy Policy.
 * Complies with CASL, PIPEDA, and App Store guideline 3.1.1.
 * Stores the accepted version and timestamps for auditability.
 */
export async function acceptTerms(userId: string, input: AcceptTermsInput): Promise<void> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const now = new Date();
  const updateData: Record<string, any> = { updatedAt: now };

  if (input.accept_tos) {
    updateData.tosAcceptedAt = now;
    updateData.tosVersion = input.tos_version;
  }
  if (input.accept_privacy) {
    updateData.privacyAcceptedAt = now;
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (!updated) {
    throw new NotFoundError('User not found');
  }
}

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
