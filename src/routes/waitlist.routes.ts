import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { waitlist } from '../db/schema/index.js';
import { success } from '../utils/response.js';
import { ValidationError, InternalError } from '../utils/errors.js';

const waitlistRoutes = new Hono();

/**
 * POST /waitlist - Add an email to the launch waitlist
 * Public endpoint (no auth required)
 */
waitlistRoutes.post('/', async (c) => {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.email) {
    throw new ValidationError('Email is required');
  }

  const email = body.email.trim().toLowerCase();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Please provide a valid email address');
  }

  // Check if already on waitlist
  const [existing] = await db
    .select()
    .from(waitlist)
    .where(eq(waitlist.email, email))
    .limit(1);

  if (existing) {
    return c.json(success({ message: 'You are already on the waitlist!' }), 200);
  }

  // Insert new entry
  const [created] = await db
    .insert(waitlist)
    .values({
      email,
      source: body.source || 'marketing_site',
    })
    .returning();

  return c.json(success({
    message: 'Successfully joined the waitlist!',
    id: created.id,
  }), 201);
});

/**
 * GET /waitlist/count - Get total waitlist count (public)
 */
waitlistRoutes.get('/count', async (c) => {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(waitlist);

  return c.json(success({ count: result?.count ?? 0 }), 200);
});

export { waitlistRoutes };
