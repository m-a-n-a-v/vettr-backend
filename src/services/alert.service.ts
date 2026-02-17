import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { alerts, stocks } from '../db/schema/index.js';
import { InternalError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface GetAlertsOptions {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function getAlertsForUser(userId: string, options: GetAlertsOptions = {}) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const { unreadOnly = false, limit = 20, offset = 0 } = options;

  const conditions = [eq(alerts.userId, userId)];
  if (unreadOnly) {
    conditions.push(eq(alerts.isRead, false));
  }

  const rows = await db
    .select({
      id: alerts.id,
      userId: alerts.userId,
      stockId: alerts.stockId,
      alertRuleId: alerts.alertRuleId,
      alertType: alerts.alertType,
      title: alerts.title,
      message: alerts.message,
      triggeredAt: alerts.triggeredAt,
      isRead: alerts.isRead,
      stockTicker: stocks.ticker,
    })
    .from(alerts)
    .leftJoin(stocks, eq(alerts.stockId, stocks.id))
    .where(and(...conditions))
    .orderBy(desc(alerts.triggeredAt))
    .limit(limit)
    .offset(offset);

  // Get total count for pagination
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(...conditions));

  const total = countResult[0]?.count ?? 0;

  return { rows, total };
}

export async function markAlertAsRead(alertId: string, userId: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const existing = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Alert not found');
  }

  if (existing[0]!.userId !== userId) {
    throw new ForbiddenError('You do not have permission to modify this alert');
  }

  const result = await db
    .update(alerts)
    .set({ isRead: true })
    .where(eq(alerts.id, alertId))
    .returning();

  return result[0]!;
}

export async function markAllAlertsAsRead(userId: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  await db
    .update(alerts)
    .set({ isRead: true })
    .where(and(eq(alerts.userId, userId), eq(alerts.isRead, false)));

  return { updated: true };
}

export async function deleteAlert(alertId: string, userId: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const existing = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Alert not found');
  }

  if (existing[0]!.userId !== userId) {
    throw new ForbiddenError('You do not have permission to delete this alert');
  }

  await db
    .delete(alerts)
    .where(eq(alerts.id, alertId));

  return { deleted: true };
}

export async function getUnreadCount(userId: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.isRead, false)));

  return countResult[0]?.count ?? 0;
}
