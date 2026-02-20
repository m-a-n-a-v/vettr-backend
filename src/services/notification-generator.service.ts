import { eq, and, desc, sql, inArray, gte } from 'drizzle-orm';
import { db } from '../config/database.js';
import { alerts, stocks, watchlistItems, filings, vetrScoreHistory } from '../db/schema/index.js';
import * as cache from './cache.service.js';
import { InternalError } from '../utils/errors.js';

/**
 * Notification Generator Service
 *
 * Auto-generates system notifications for users based on their watchlist stocks.
 * Runs per-user when they load the dashboard (lazy generation).
 * Uses a 24h cooldown per user to avoid excessive writes.
 *
 * Notification types:
 * - New filings on watchlist stocks (last 7 days)
 * - VETR score changes (significant drops/gains)
 * - Welcome notification for new users
 */

const GENERATION_COOLDOWN = 24 * 60 * 60; // 24 hours in seconds
const FILING_LOOKBACK_DAYS = 7;
const SCORE_CHANGE_THRESHOLD = 10; // notify on >= 10 point change

interface GenerationResult {
  generated: number;
  skipped: boolean;
}

/**
 * Generate system notifications for a user.
 * Called lazily from the unread-count or alerts list endpoint.
 * Idempotent: uses Redis cooldown + DB dedup to avoid duplicates.
 */
export async function generateNotificationsForUser(userId: string): Promise<GenerationResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Check cooldown - only generate once per 24h per user
  const cooldownKey = `notif_gen:${userId}`;
  const lastRun = await cache.get<string>(cooldownKey);
  if (lastRun) {
    return { generated: 0, skipped: true };
  }

  // Set cooldown immediately to prevent concurrent runs
  await cache.set(cooldownKey, new Date().toISOString(), GENERATION_COOLDOWN);

  // Get user's watchlist stock IDs
  const watchlist = await db
    .select({
      stockId: watchlistItems.stockId,
      ticker: stocks.ticker,
      name: stocks.name,
      vetrScore: stocks.vetrScore,
    })
    .from(watchlistItems)
    .innerJoin(stocks, eq(watchlistItems.stockId, stocks.id))
    .where(eq(watchlistItems.userId, userId));

  if (watchlist.length === 0) {
    return { generated: 0, skipped: false };
  }

  let generated = 0;

  // 1. New filings notifications
  generated += await generateFilingNotifications(userId, watchlist);

  // 2. Score change notifications
  generated += await generateScoreChangeNotifications(userId, watchlist);

  return { generated, skipped: false };
}

/**
 * Generate notifications for new filings on watchlist stocks.
 * Only creates notification if no existing alert for the same filing exists.
 */
async function generateFilingNotifications(
  userId: string,
  watchlist: { stockId: string; ticker: string; name: string; vetrScore: number | null }[],
): Promise<number> {
  if (!db) return 0;

  const stockIds = watchlist.map(s => s.stockId);
  const lookbackDate = new Date(Date.now() - FILING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Find recent filings for watchlist stocks
  const recentFilings = await db
    .select({
      id: filings.id,
      stockId: filings.stockId,
      type: filings.type,
      title: filings.title,
      date: filings.date,
      isMaterial: filings.isMaterial,
    })
    .from(filings)
    .where(
      and(
        inArray(filings.stockId, stockIds),
        gte(filings.date, lookbackDate),
      )
    )
    .orderBy(desc(filings.date))
    .limit(20);

  if (recentFilings.length === 0) return 0;

  // Get existing alert messages for this user to avoid duplicates
  const existingAlerts = await db
    .select({ message: alerts.message })
    .from(alerts)
    .where(
      and(
        eq(alerts.userId, userId),
        eq(alerts.alertType, 'New Filing'),
        gte(alerts.triggeredAt, lookbackDate),
      )
    );

  const existingMessages = new Set(existingAlerts.map(a => a.message));

  const stockMap = new Map(watchlist.map(s => [s.stockId, s]));
  let count = 0;

  for (const filing of recentFilings) {
    const stock = stockMap.get(filing.stockId);
    if (!stock) continue;

    const message = `${stock.name} (${stock.ticker}) filed a new ${filing.type}: "${filing.title}" on ${filing.date.toISOString().split('T')[0]}.`;

    // Skip if already notified
    if (existingMessages.has(message)) continue;

    await db.insert(alerts).values({
      userId,
      stockId: filing.stockId,
      alertRuleId: null,
      alertType: 'New Filing',
      title: `New ${filing.type} filing: ${stock.ticker}`,
      message,
      triggeredAt: filing.date,
      isRead: false,
    });

    count++;
    if (count >= 10) break; // Cap at 10 filing notifications per run
  }

  return count;
}

/**
 * Generate notifications for significant VETR score changes.
 * Compares latest score to the score from 7 days ago.
 */
async function generateScoreChangeNotifications(
  userId: string,
  watchlist: { stockId: string; ticker: string; name: string; vetrScore: number | null }[],
): Promise<number> {
  if (!db) return 0;

  const lookbackDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tickers = watchlist.map(s => s.ticker);
  let count = 0;

  for (const stock of watchlist) {
    // Get latest score and score from ~7 days ago
    const scoreHistory = await db
      .select({
        overallScore: vetrScoreHistory.overallScore,
        calculatedAt: vetrScoreHistory.calculatedAt,
      })
      .from(vetrScoreHistory)
      .where(eq(vetrScoreHistory.stockTicker, stock.ticker))
      .orderBy(desc(vetrScoreHistory.calculatedAt))
      .limit(2);

    if (scoreHistory.length < 2) continue;

    const currentScore = scoreHistory[0]!.overallScore;
    const previousScore = scoreHistory[1]!.overallScore;
    const change = currentScore - previousScore;

    if (Math.abs(change) < SCORE_CHANGE_THRESHOLD) continue;

    // Check for existing notification
    const existingCheck = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.userId, userId),
          eq(alerts.alertType, 'Score Change'),
          eq(alerts.stockId, stock.stockId),
          gte(alerts.triggeredAt, lookbackDate),
        )
      )
      .limit(1);

    if (existingCheck.length > 0) continue;

    const direction = change > 0 ? 'increased' : 'decreased';
    const emoji = change > 0 ? 'up' : 'down';

    await db.insert(alerts).values({
      userId,
      stockId: stock.stockId,
      alertRuleId: null,
      alertType: 'Score Change',
      title: `${stock.ticker} score ${direction} by ${Math.abs(change)} pts`,
      message: `${stock.name} (${stock.ticker}) VETR score ${direction} from ${previousScore} to ${currentScore} (${change > 0 ? '+' : ''}${change} points).`,
      triggeredAt: new Date(),
      isRead: false,
    });

    count++;
  }

  return count;
}
