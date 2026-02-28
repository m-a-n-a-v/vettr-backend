import type { Context, Next } from 'hono';
import { env } from '../config/env.js';
import { AuthRequiredError } from '../utils/errors.js';
import crypto from 'crypto';

/**
 * Admin auth middleware that checks for admin secret token
 * Protects admin-only endpoints using X-Admin-Secret header
 *
 * If ADMIN_SECRET is not configured, allows access for development
 * In production, requires X-Admin-Secret header matching ADMIN_SECRET env var
 */
export async function adminAuthMiddleware(c: Context, next: Next): Promise<void> {
  const adminSecret = env.ADMIN_SECRET;

  // If no admin secret is configured, allow access (development mode)
  if (!adminSecret) {
    console.warn('⚠️  ADMIN_SECRET not configured - admin endpoints are unprotected');
    await next();
    return;
  }

  // Check for X-Admin-Secret header
  const providedSecret = c.req.header('X-Admin-Secret');

  if (!providedSecret) {
    throw new AuthRequiredError('X-Admin-Secret header is required for admin endpoints');
  }

  // Use timing-safe comparison to prevent timing attacks
  const a = Buffer.from(providedSecret);
  const b = Buffer.from(adminSecret);
  const safe = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!safe) {
    throw new AuthRequiredError('Invalid admin secret');
  }

  await next();
}
