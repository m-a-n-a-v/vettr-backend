/**
 * Admin routes for tables with composite primary keys
 * These tables don't have a single 'id' column, so they need custom routes instead of using the generic factory
 */

import { Hono } from 'hono';
import { db } from '../config/database.js';
import { watchlistItems, filingReads, redFlagAcknowledgments } from '../db/schema/index.js';
import { success, paginated } from '../utils/response.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import type { PaginationMeta } from '../types/pagination.js';

/**
 * Watchlist Items Routes
 * Composite PK: (userId, stockId)
 */
export const watchlistItemsRoutes = new Hono();

// GET /admin/watchlist-items - List with pagination and filters
watchlistItemsRoutes.get('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const { limit = '25', offset = '0', filter_userId, filter_stockId } = c.req.query();

  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 25), 100);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  // Build where conditions
  const conditions = [];
  if (filter_userId) {
    conditions.push(eq(watchlistItems.userId, filter_userId));
  }
  if (filter_stockId) {
    conditions.push(eq(watchlistItems.stockId, filter_stockId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(watchlistItems)
    .where(whereClause);

  // Get paginated items
  const items = await db
    .select()
    .from(watchlistItems)
    .where(whereClause)
    .orderBy(desc(watchlistItems.addedAt))
    .limit(limitNum)
    .offset(offsetNum);

  const pagination: PaginationMeta = {
    total: count,
    limit: limitNum,
    offset: offsetNum,
    has_more: offsetNum + limitNum < count,
  };

  return c.json(paginated(items, pagination));
});

// POST /admin/watchlist-items - Create new watchlist item
watchlistItemsRoutes.post('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const body = await c.req.json();
  const { userId, stockId } = body;

  if (!userId || !stockId) {
    throw new ValidationError('userId and stockId are required');
  }

  const [created] = await db
    .insert(watchlistItems)
    .values({ userId, stockId })
    .returning();

  return c.json(success(created), 201);
});

// DELETE /admin/watchlist-items - Delete by composite key
watchlistItemsRoutes.delete('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const body = await c.req.json();
  const { userId, stockId } = body;

  if (!userId || !stockId) {
    throw new ValidationError('userId and stockId are required');
  }

  const deleted = await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.stockId, stockId)))
    .returning();

  if (deleted.length === 0) {
    throw new NotFoundError('Watchlist item not found');
  }

  return c.json(success({ deleted: true }));
});

/**
 * Filing Reads Routes
 * Composite PK: (userId, filingId)
 */
export const filingReadsRoutes = new Hono();

// GET /admin/filing-reads - List with pagination and filters
filingReadsRoutes.get('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const { limit = '25', offset = '0', filter_userId, filter_filingId } = c.req.query();

  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 25), 100);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  // Build where conditions
  const conditions = [];
  if (filter_userId) {
    conditions.push(eq(filingReads.userId, filter_userId));
  }
  if (filter_filingId) {
    conditions.push(eq(filingReads.filingId, filter_filingId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(filingReads)
    .where(whereClause);

  // Get paginated items
  const items = await db
    .select()
    .from(filingReads)
    .where(whereClause)
    .orderBy(desc(filingReads.readAt))
    .limit(limitNum)
    .offset(offsetNum);

  const pagination: PaginationMeta = {
    total: count,
    limit: limitNum,
    offset: offsetNum,
    has_more: offsetNum + limitNum < count,
  };

  return c.json(paginated(items, pagination));
});

// POST /admin/filing-reads - Create new filing read
filingReadsRoutes.post('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const body = await c.req.json();
  const { userId, filingId } = body;

  if (!userId || !filingId) {
    throw new ValidationError('userId and filingId are required');
  }

  const [created] = await db
    .insert(filingReads)
    .values({ userId, filingId })
    .returning();

  return c.json(success(created), 201);
});

// DELETE /admin/filing-reads - Delete by composite key
filingReadsRoutes.delete('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const body = await c.req.json();
  const { userId, filingId } = body;

  if (!userId || !filingId) {
    throw new ValidationError('userId and filingId are required');
  }

  const deleted = await db
    .delete(filingReads)
    .where(and(eq(filingReads.userId, userId), eq(filingReads.filingId, filingId)))
    .returning();

  if (deleted.length === 0) {
    throw new NotFoundError('Filing read not found');
  }

  return c.json(success({ deleted: true }));
});

/**
 * Red Flag Acknowledgments Routes
 * Composite PK: (userId, redFlagId)
 */
export const redFlagAcknowledgmentsRoutes = new Hono();

// GET /admin/red-flag-acknowledgments - List with pagination and filters
redFlagAcknowledgmentsRoutes.get('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const { limit = '25', offset = '0', filter_userId, filter_redFlagId } = c.req.query();

  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 25), 100);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  // Build where conditions
  const conditions = [];
  if (filter_userId) {
    conditions.push(eq(redFlagAcknowledgments.userId, filter_userId));
  }
  if (filter_redFlagId) {
    conditions.push(eq(redFlagAcknowledgments.redFlagId, filter_redFlagId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(redFlagAcknowledgments)
    .where(whereClause);

  // Get paginated items
  const items = await db
    .select()
    .from(redFlagAcknowledgments)
    .where(whereClause)
    .orderBy(desc(redFlagAcknowledgments.acknowledgedAt))
    .limit(limitNum)
    .offset(offsetNum);

  const pagination: PaginationMeta = {
    total: count,
    limit: limitNum,
    offset: offsetNum,
    has_more: offsetNum + limitNum < count,
  };

  return c.json(paginated(items, pagination));
});

// POST /admin/red-flag-acknowledgments - Create new acknowledgment
redFlagAcknowledgmentsRoutes.post('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const body = await c.req.json();
  const { userId, redFlagId } = body;

  if (!userId || !redFlagId) {
    throw new ValidationError('userId and redFlagId are required');
  }

  const [created] = await db
    .insert(redFlagAcknowledgments)
    .values({ userId, redFlagId })
    .returning();

  return c.json(success(created), 201);
});

// DELETE /admin/red-flag-acknowledgments - Delete by composite key
redFlagAcknowledgmentsRoutes.delete('/', async (c) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const body = await c.req.json();
  const { userId, redFlagId } = body;

  if (!userId || !redFlagId) {
    throw new ValidationError('userId and redFlagId are required');
  }

  const deleted = await db
    .delete(redFlagAcknowledgments)
    .where(and(eq(redFlagAcknowledgments.userId, userId), eq(redFlagAcknowledgments.redFlagId, redFlagId)))
    .returning();

  if (deleted.length === 0) {
    throw new NotFoundError('Red flag acknowledgment not found');
  }

  return c.json(success({ deleted: true }));
});
