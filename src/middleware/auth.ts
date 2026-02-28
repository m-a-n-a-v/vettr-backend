import type { Context, Next } from 'hono';
import { createClerkClient } from '@clerk/backend';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { AuthRequiredError, AuthExpiredError } from '../utils/errors.js';

export interface AuthUser {
  id: string;
  email: string;
  tier: string;
}

// Initialise Clerk client once at module level — it caches JWKS internally.
const clerkClient = env.CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
  : null;

/**
 * Auth middleware that verifies Clerk session JWTs.
 * Extracts the Bearer token from the Authorization header, verifies it
 * against Clerk's JWKS, and auto-provisions our DB user on first sign-in.
 *
 * Throws AuthRequiredError (401) if no token is provided or token is invalid.
 * Throws AuthExpiredError (401) if the token has expired.
 */
export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    throw new AuthRequiredError('Authorization header is required');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthRequiredError('Authorization header must use Bearer scheme');
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw new AuthRequiredError('Access token is required');
  }

  if (!clerkClient) {
    throw new AuthRequiredError('Authentication service not configured (CLERK_SECRET_KEY missing)');
  }

  try {
    // Verify the Clerk session token — throws if invalid or expired.
    const payload = await clerkClient.verifyToken(token);

    // payload.sub is the Clerk user ID (e.g. "user_2NNEqL2nrIRdJ...")
    const clerkId = payload.sub;

    const user = await findOrProvisionUser(clerkId);

    c.set('user', user);
    await next();
  } catch (error) {
    if (error instanceof AuthRequiredError || error instanceof AuthExpiredError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('expired') || message.includes('TokenExpiredError')) {
      throw new AuthExpiredError('Access token has expired');
    }

    throw new AuthRequiredError('Invalid access token');
  }
}

/**
 * Looks up our DB user by Clerk ID.
 * On first sign-in the Clerk user is not yet in our DB, so we fetch
 * their profile from Clerk and create a record automatically.
 */
async function findOrProvisionUser(clerkId: string): Promise<AuthUser> {
  // Fast path: user already exists in our DB.
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, email: true, tier: true },
  });

  if (existing) {
    return { id: existing.id, email: existing.email, tier: existing.tier };
  }

  // Provision: fetch profile from Clerk and insert into our DB.
  const clerkUser = await clerkClient!.users.getUser(clerkId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@clerk.local`;
  const firstName = clerkUser.firstName ?? '';
  const lastName = clerkUser.lastName ?? '';
  const displayName = `${firstName} ${lastName}`.trim() || email.split('@')[0];
  const avatarUrl = clerkUser.imageUrl ?? null;

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      displayName,
      avatarUrl,
      authProvider: 'clerk',
      tier: 'free',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { clerkId, avatarUrl, updatedAt: new Date() },
    })
    .returning({ id: users.id, email: users.email, tier: users.tier });

  return { id: created.id, email: created.email, tier: created.tier };
}
