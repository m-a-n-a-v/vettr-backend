import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users, refreshTokens } from '../db/schema/index.js';
import { hashPassword } from '../utils/password.js';
import { signRefreshToken } from '../utils/jwt.js';
import { ConflictError, InternalError, AuthInvalidCredentialsError } from '../utils/errors.js';
import { env } from '../config/env.js';
import bcrypt from 'bcrypt';

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash?: string;
  authProvider?: string;
  authProviderId?: string;
  avatarUrl?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string;
  tier?: string;
}

export type UserRow = typeof users.$inferSelect;

/**
 * Create a new user in the database.
 * Throws ConflictError if email is already taken.
 */
export async function createUser(input: CreateUserInput): Promise<UserRow> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError('A user with this email already exists');
  }

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash ?? null,
      authProvider: input.authProvider ?? 'email',
      authProviderId: input.authProviderId ?? null,
      avatarUrl: input.avatarUrl ?? null,
    })
    .returning();

  return user;
}

/**
 * Find a user by email address.
 * Returns the user or null if not found.
 */
export async function findByEmail(email: string): Promise<UserRow | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user ?? null;
}

/**
 * Find a user by auth provider and provider ID.
 * Used for OAuth login (Google, Apple).
 * Returns the user or null if not found.
 */
export async function findByProviderId(
  provider: string,
  providerId: string,
): Promise<UserRow | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const results = await db
    .select()
    .from(users)
    .where(eq(users.authProviderId, providerId))
    .limit(1);

  const user = results[0];

  if (user && user.authProvider !== provider) {
    return null;
  }

  return user ?? null;
}

/**
 * Update a user's profile fields.
 * Returns the updated user.
 */
export async function updateUser(
  userId: string,
  input: UpdateUserInput,
): Promise<UserRow> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [updated] = await db
    .update(users)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated;
}

/**
 * Store a hashed refresh token in the database.
 * The raw token is hashed with bcrypt before storage.
 * Returns the raw token (to send to the client) and the expiry date.
 */
export async function storeRefreshToken(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const { token, expiresAt } = signRefreshToken();
  const tokenHash = await bcrypt.hash(token, 12);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Verify a refresh token against stored hashes.
 * Returns the matching token row if valid, null otherwise.
 * Only checks non-revoked, non-expired tokens for the given user.
 */
export async function verifyRefreshToken(
  userId: string,
  rawToken: string,
): Promise<(typeof refreshTokens.$inferSelect) | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const tokens = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.userId, userId));

  for (const tokenRow of tokens) {
    if (tokenRow.isRevoked) continue;
    if (tokenRow.expiresAt < new Date()) continue;

    const matches = await bcrypt.compare(rawToken, tokenRow.tokenHash);
    if (matches) {
      return tokenRow;
    }
  }

  return null;
}

/**
 * Revoke a specific refresh token by its ID.
 */
export async function revokeRefreshToken(tokenId: string): Promise<void> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  await db
    .update(refreshTokens)
    .set({ isRevoked: true })
    .where(eq(refreshTokens.id, tokenId));
}

/**
 * Revoke all refresh tokens for a user.
 * Used during password change or account compromise.
 */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  await db
    .update(refreshTokens)
    .set({ isRevoked: true })
    .where(eq(refreshTokens.userId, userId));
}

/**
 * Verify a Google OAuth id_token via Google's tokeninfo endpoint.
 * Returns the verified token claims (email, name, picture, sub).
 * Throws AuthInvalidCredentialsError if token is invalid or audience doesn't match.
 */
export interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string;
  name: string;
  picture?: string;
  aud: string;
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleTokenInfo> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!response.ok) {
    throw new AuthInvalidCredentialsError('Invalid Google ID token');
  }

  const tokenInfo = (await response.json()) as GoogleTokenInfo;

  // Verify the audience matches our Google Client ID (if configured)
  if (env.GOOGLE_CLIENT_ID && tokenInfo.aud !== env.GOOGLE_CLIENT_ID) {
    throw new AuthInvalidCredentialsError('Google token audience mismatch');
  }

  if (!tokenInfo.email) {
    throw new AuthInvalidCredentialsError('Google token missing email claim');
  }

  return tokenInfo;
}

/**
 * Upsert a user from an OAuth provider.
 * Creates a new user if not found by provider ID or email.
 * Updates existing user if found.
 */
export async function upsertOAuthUser(input: {
  provider: string;
  providerId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}): Promise<UserRow> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // First, try to find by provider ID
  const existingByProvider = await findByProviderId(input.provider, input.providerId);
  if (existingByProvider) {
    // Update existing user's profile info
    const updated = await updateUser(existingByProvider.id, {
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
    });
    return updated;
  }

  // Next, try to find by email (user may have signed up with email/password first)
  const existingByEmail = await findByEmail(input.email);
  if (existingByEmail) {
    // Link the OAuth provider to the existing account
    const [updated] = await db
      .update(users)
      .set({
        authProvider: input.provider,
        authProviderId: input.providerId,
        avatarUrl: input.avatarUrl ?? existingByEmail.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingByEmail.id))
      .returning();
    return updated;
  }

  // Create a new user
  const newUser = await createUser({
    email: input.email,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    authProvider: input.provider,
    authProviderId: input.providerId,
  });

  return newUser;
}
