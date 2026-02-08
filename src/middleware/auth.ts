import type { Context, Next } from 'hono';
import { verifyAccessToken } from '../utils/jwt.js';
import { AuthRequiredError, AuthExpiredError } from '../utils/errors.js';

export interface AuthUser {
  id: string;
  email: string;
  tier: string;
}

/**
 * Auth middleware that verifies JWT access tokens.
 * Extracts the Bearer token from the Authorization header,
 * verifies signature and expiry, and attaches user info to context.
 *
 * Throws AuthRequiredError (401) if no token is provided.
 * Throws AuthExpiredError (401) if the token has expired.
 * Throws AuthRequiredError (401) if the token is invalid.
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

  try {
    const payload = verifyAccessToken(token);

    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      tier: payload.tier,
    };

    c.set('user', user);

    await next();
  } catch (error) {
    if (error instanceof AuthRequiredError || error instanceof AuthExpiredError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'TokenExpiredError') {
      throw new AuthExpiredError('Access token has expired');
    }

    throw new AuthRequiredError('Invalid access token');
  }
}
