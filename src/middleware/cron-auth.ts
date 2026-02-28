import type { Context, Next } from 'hono';
import { env } from '../config/env.js';
import { AuthRequiredError } from '../utils/errors.js';
import crypto from 'crypto';

/**
 * Cron auth middleware that verifies Vercel cron requests
 * Protects cron endpoints using Authorization: Bearer <CRON_SECRET>
 *
 * If CRON_SECRET is not configured, allows access for development
 * In production, requires Authorization header with Bearer token matching CRON_SECRET env var
 */
export async function cronAuthMiddleware(c: Context, next: Next): Promise<void> {
  const cronSecret = env.CRON_SECRET;

  // If no cron secret is configured, allow access (development mode)
  if (!cronSecret) {
    await next();
    return;
  }

  // Check for Authorization header
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    throw new AuthRequiredError('Invalid cron secret');
  }

  // Extract Bearer token
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  if (!token) {
    throw new AuthRequiredError('Invalid cron secret');
  }

  // Use timing-safe comparison to prevent timing attacks
  const a = Buffer.from(token);
  const b = Buffer.from(cronSecret);
  const safe = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!safe) {
    throw new AuthRequiredError('Invalid cron secret');
  }

  await next();
}
