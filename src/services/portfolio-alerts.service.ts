import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { portfolioAlerts, portfolios } from '../db/schema/index.js';
import * as cache from './cache.service.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

// --- Types ---

export interface AlertDto {
  id: string;
  user_id: string;
  portfolio_id: string | null;
  holding_id: string | null;
  alert_type: string;
  title: string;
  message: string;
  severity: string;
  deep_link: string | null;
  is_read: boolean;
  triggered_at: string;
}

// --- Constants ---

const ALERTS_CACHE_TTL = 2 * 60; // 2 minutes

// --- Queries ---

export async function getUserAlerts(
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number; offset?: number }
): Promise<{ items: AlertDto[]; total: number }> {
  if (!db) throw new InternalError('Database not available');

  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const conditions = [eq(portfolioAlerts.userId, userId)];

  if (options?.unreadOnly) {
    conditions.push(eq(portfolioAlerts.isRead, false));
  }

  const whereClause = and(...conditions);

  const cacheKey = `alerts:${userId}:${options?.unreadOnly ? 'unread' : 'all'}:${limit}:${offset}`;
  const cached = await cache.get<{ items: AlertDto[]; total: number }>(cacheKey);
  if (cached) return cached;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(portfolioAlerts)
      .where(whereClause)
      .orderBy(desc(portfolioAlerts.triggeredAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(portfolioAlerts)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const result = {
    items: items.map(toAlertDto),
    total,
  };

  await cache.set(cacheKey, result, ALERTS_CACHE_TTL);

  return result;
}

export async function getUnreadCount(userId: string): Promise<number> {
  if (!db) throw new InternalError('Database not available');

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(portfolioAlerts)
    .where(
      and(
        eq(portfolioAlerts.userId, userId),
        eq(portfolioAlerts.isRead, false)
      )
    );

  return result[0]?.count ?? 0;
}

export async function markAlertRead(userId: string, alertId: string) {
  if (!db) throw new InternalError('Database not available');

  const result = await db
    .update(portfolioAlerts)
    .set({ isRead: true })
    .where(
      and(
        eq(portfolioAlerts.id, alertId),
        eq(portfolioAlerts.userId, userId)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('Alert not found');
  }

  // Invalidate cache
  await invalidateUserAlertCache(userId);

  return { marked: true };
}

export async function markAllAlertsRead(userId: string) {
  if (!db) throw new InternalError('Database not available');

  await db
    .update(portfolioAlerts)
    .set({ isRead: true })
    .where(
      and(
        eq(portfolioAlerts.userId, userId),
        eq(portfolioAlerts.isRead, false)
      )
    );

  await invalidateUserAlertCache(userId);

  return { marked: true };
}

/**
 * Create a portfolio alert. Called by insight generators or cron jobs.
 */
export async function createAlert(input: {
  userId: string;
  portfolioId?: string;
  holdingId?: string;
  alertType: string;
  title: string;
  message: string;
  severity?: string;
  deepLink?: string;
}) {
  if (!db) throw new InternalError('Database not available');

  const result = await db
    .insert(portfolioAlerts)
    .values({
      userId: input.userId,
      portfolioId: input.portfolioId ?? null,
      holdingId: input.holdingId ?? null,
      alertType: input.alertType,
      title: input.title,
      message: input.message,
      severity: input.severity ?? 'info',
      deepLink: input.deepLink ?? null,
    })
    .returning();

  await invalidateUserAlertCache(input.userId);

  return result[0]!;
}

// --- Helpers ---

async function invalidateUserAlertCache(userId: string) {
  // Delete known cache patterns for this user
  await cache.del(`alerts:${userId}:all:20:0`);
  await cache.del(`alerts:${userId}:unread:20:0`);
}

function toAlertDto(alert: any): AlertDto {
  return {
    id: alert.id,
    user_id: alert.userId,
    portfolio_id: alert.portfolioId,
    holding_id: alert.holdingId,
    alert_type: alert.alertType,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    deep_link: alert.deepLink,
    is_read: alert.isRead,
    triggered_at: alert.triggeredAt?.toISOString() ?? '',
  };
}
