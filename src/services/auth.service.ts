import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users, refreshTokens } from '../db/schema/index.js';
import { hashPassword } from '../utils/password.js';
import { signRefreshToken } from '../utils/jwt.js';
import { ConflictError, InternalError, AuthInvalidCredentialsError } from '../utils/errors.js';
import { env } from '../config/env.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
 * Find a user by their ID.
 * Returns the user or null if not found.
 */
export async function findById(userId: string): Promise<UserRow | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

/**
 * Find and verify a refresh token across all users.
 * Iterates non-revoked, non-expired tokens and bcrypt-compares.
 * Returns the matching token row and user ID if valid, null otherwise.
 */
export async function findAndVerifyRefreshToken(
  rawToken: string,
): Promise<{ tokenRow: typeof refreshTokens.$inferSelect; userId: string } | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const allTokens = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.isRevoked, false));

  for (const tokenRow of allTokens) {
    if (tokenRow.expiresAt < new Date()) continue;

    const matches = await bcrypt.compare(rawToken, tokenRow.tokenHash);
    if (matches) {
      return { tokenRow, userId: tokenRow.userId };
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
 * Apple JWKS key structure.
 */
interface AppleJWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface AppleJWKS {
  keys: AppleJWK[];
}

/**
 * Apple identity token payload claims.
 */
export interface AppleTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  email?: string;
  email_verified?: string | boolean;
}

let cachedAppleJWKS: { keys: AppleJWKS; fetchedAt: number } | null = null;
const APPLE_JWKS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch Apple's public keys (JWKS) from https://appleid.apple.com/auth/keys.
 * Caches the result for 24 hours.
 */
async function fetchAppleJWKS(): Promise<AppleJWKS> {
  if (cachedAppleJWKS && Date.now() - cachedAppleJWKS.fetchedAt < APPLE_JWKS_CACHE_TTL) {
    return cachedAppleJWKS.keys;
  }

  const response = await fetch('https://appleid.apple.com/auth/keys');
  if (!response.ok) {
    throw new AuthInvalidCredentialsError('Failed to fetch Apple public keys');
  }

  const jwks = (await response.json()) as AppleJWKS;
  cachedAppleJWKS = { keys: jwks, fetchedAt: Date.now() };
  return jwks;
}

/**
 * Verify an Apple identity_token by fetching JWKS from Apple and validating
 * the token's signature, issuer, audience, and expiration.
 * Returns the verified token claims (sub, email).
 * Throws AuthInvalidCredentialsError if the token is invalid.
 */
export async function verifyAppleToken(identityToken: string): Promise<AppleTokenClaims> {
  // Decode the token header to get the kid (key ID)
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new AuthInvalidCredentialsError('Invalid Apple identity token');
  }

  const { kid, alg } = decoded.header;
  if (!kid) {
    throw new AuthInvalidCredentialsError('Apple token missing key ID (kid)');
  }

  // Fetch Apple's JWKS and find the matching key
  const jwks = await fetchAppleJWKS();
  const matchingKey = jwks.keys.find((key) => key.kid === kid);
  if (!matchingKey) {
    throw new AuthInvalidCredentialsError('Apple token key not found in JWKS');
  }

  // Convert JWK to PEM public key using Node's crypto module
  const publicKey = crypto.createPublicKey({
    key: {
      kty: matchingKey.kty,
      n: matchingKey.n,
      e: matchingKey.e,
    },
    format: 'jwk',
  });

  const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  // Verify the token signature, expiration, and claims
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(identityToken, pem, {
      algorithms: [alg as jwt.Algorithm],
      issuer: 'https://appleid.apple.com',
    }) as jwt.JwtPayload;
  } catch {
    throw new AuthInvalidCredentialsError('Apple identity token verification failed');
  }

  // Validate audience matches our Apple Client ID (if configured)
  if (env.APPLE_CLIENT_ID && payload.aud !== env.APPLE_CLIENT_ID) {
    throw new AuthInvalidCredentialsError('Apple token audience mismatch');
  }

  if (!payload.sub) {
    throw new AuthInvalidCredentialsError('Apple token missing subject claim');
  }

  return {
    iss: payload.iss as string,
    sub: payload.sub,
    aud: payload.aud as string,
    email: payload.email as string | undefined,
    email_verified: payload.email_verified as string | boolean | undefined,
  };
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
