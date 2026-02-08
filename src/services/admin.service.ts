import { sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { MetricsStore } from '../middleware/metrics-tracker.js';
import {
  users,
  stocks,
  filings,
  executives,
  alertRules,
  alerts,
  watchlistItems,
  vetrScoreHistory,
  redFlagHistory,
} from '../db/schema/index.js';

/**
 * Admin service for retrieving system metrics and health information
 */
export class AdminService {
  /**
   * Get comprehensive system metrics
   * Includes uptime, request stats, active users, and database table counts
   */
  async getSystemMetrics() {
    const metricsStore = MetricsStore.getInstance();
    const inMemoryMetrics = metricsStore.getMetrics();

    // If database is not configured, return only in-memory metrics
    if (!db) {
      return {
        uptime_seconds: inMemoryMetrics.uptime,
        total_requests: inMemoryMetrics.totalRequests,
        average_response_time_ms: inMemoryMetrics.averageResponseTime,
        active_users_30d: 0,
        database_stats: {
          users: 0,
          stocks: 0,
          filings: 0,
          executives: 0,
          alert_rules: 0,
          alerts: 0,
          watchlist_items: 0,
          vetr_score_history: 0,
          red_flag_history: 0,
        },
        note: 'Database not configured - stats unavailable',
      };
    }

    // Get active users count (users who have logged in within last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Count active users (those created in last 30 days as a proxy)
    const activeUsersResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} >= ${thirtyDaysAgo}`);

    const activeUsersCount = activeUsersResult[0]?.count ?? 0;

    // Get database statistics (table row counts)
    const [
      usersCount,
      stocksCount,
      filingsCount,
      executivesCount,
      alertRulesCount,
      alertsCount,
      watchlistItemsCount,
      vetrScoreHistoryCount,
      redFlagHistoryCount,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(stocks),
      db.select({ count: sql<number>`count(*)::int` }).from(filings),
      db.select({ count: sql<number>`count(*)::int` }).from(executives),
      db.select({ count: sql<number>`count(*)::int` }).from(alertRules),
      db.select({ count: sql<number>`count(*)::int` }).from(alerts),
      db.select({ count: sql<number>`count(*)::int` }).from(watchlistItems),
      db.select({ count: sql<number>`count(*)::int` }).from(vetrScoreHistory),
      db.select({ count: sql<number>`count(*)::int` }).from(redFlagHistory),
    ]);

    return {
      uptime_seconds: inMemoryMetrics.uptime,
      total_requests: inMemoryMetrics.totalRequests,
      average_response_time_ms: inMemoryMetrics.averageResponseTime,
      active_users_30d: activeUsersCount,
      database_stats: {
        users: usersCount[0]?.count ?? 0,
        stocks: stocksCount[0]?.count ?? 0,
        filings: filingsCount[0]?.count ?? 0,
        executives: executivesCount[0]?.count ?? 0,
        alert_rules: alertRulesCount[0]?.count ?? 0,
        alerts: alertsCount[0]?.count ?? 0,
        watchlist_items: watchlistItemsCount[0]?.count ?? 0,
        vetr_score_history: vetrScoreHistoryCount[0]?.count ?? 0,
        red_flag_history: redFlagHistoryCount[0]?.count ?? 0,
      },
    };
  }
}

export const adminService = new AdminService();
