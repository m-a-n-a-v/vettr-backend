import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  tier: string;
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Sign an access token with the given payload.
 * Access tokens expire in 15 minutes and contain { sub, email, tier }.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    { sub: payload.sub, email: payload.email, tier: payload.tier },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL },
  );
}

/**
 * Generate a refresh token as an opaque UUID string.
 * Refresh tokens are stored hashed in the DB with a 30-day TTL.
 * Returns the raw token and its expiry date.
 */
export function signRefreshToken(): { token: string; expiresAt: Date } {
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return { token, expiresAt };
}

/**
 * Verify an access token and return its decoded payload.
 * Throws if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

  return {
    sub: decoded.sub as string,
    email: decoded.email as string,
    tier: decoded.tier as string,
  };
}

/**
 * Decode a token without verifying the signature.
 * Useful for inspecting expired tokens or debugging.
 * Returns null if the token cannot be decoded.
 */
export function decodeToken(token: string): jwt.JwtPayload | null {
  const decoded = jwt.decode(token, { complete: false });
  if (decoded && typeof decoded === 'object') {
    return decoded as jwt.JwtPayload;
  }
  return null;
}
