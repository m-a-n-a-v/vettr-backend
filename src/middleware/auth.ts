import type { Context, Next } from 'hono';
import { db } from '../config/database.js';
import { users } from '../db/schema/users.js';
import { eq } from 'drizzle-orm';
import { AuthRequiredError, AuthExpiredError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';

export interface AuthUser {
  id: string;
  email: string;
  tier: string;
}

/**
 * Auth middleware that verifies JWT Bearer tokens.
 *
 * Accepts tokens issued by /auth/login, /auth/signup, /auth/refresh
 * (HS256, signed with JWT_SECRET).
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

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('expired') || message.includes('TokenExpiredError')) {
      throw new AuthExpiredError('Access token has expired');
    }
    throw new AuthRequiredError('Invalid access token');
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    throw new AuthRequiredError('User not found');
  }

  c.set('user', user);
  await next();
}

/**
 * Looks up our DB user by internal user ID (UUID).
 */
async function findUserById(userId: string): Promise<AuthUser | null> {
  if (!db) {
    throw new AuthRequiredError('Database not available');
  }

  const [existing] = await db
    .select({ id: users.id, email: users.email, tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return existing ? { id: existing.id, email: existing.email, tier: existing.tier } : null;
}
