import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { watchlistItems, stocks } from '../db/schema/index.js';
import { InternalError, NotFoundError, TierLimitError } from '../utils/errors.js';

// Tier-based watchlist limits
const TIER_LIMITS = {
  free: 5,
  pro: 25,
  premium: Infinity, // unlimited
} as const;

/**
 * Get user's full watchlist with stock data
 */
export async function getWatchlist(userId: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Join watchlist_items with stocks to return full stock data
  const results = await db
    .select({
      stock: stocks,
      addedAt: watchlistItems.addedAt,
    })
    .from(watchlistItems)
    .innerJoin(stocks, eq(watchlistItems.stockId, stocks.id))
    .where(eq(watchlistItems.userId, userId))
    .orderBy(watchlistItems.addedAt);

  return results.map((row) => ({
    ...row.stock,
    added_at: row.addedAt,
  }));
}

/**
 * Add a stock to user's watchlist with tier limit enforcement
 */
export async function addToWatchlist(userId: string, ticker: string, userTier: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Normalize ticker to uppercase
  const normalizedTicker = ticker.toUpperCase();

  // Find the stock by ticker
  const stockResult = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, normalizedTicker))
    .limit(1);

  if (stockResult.length === 0) {
    throw new NotFoundError(`Stock with ticker '${normalizedTicker}' not found`);
  }

  const stock = stockResult[0]!;

  // Check current watchlist count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, userId));

  const currentCount = countResult[0]?.count ?? 0;

  // Determine tier limit
  const tierLower = userTier.toLowerCase() as keyof typeof TIER_LIMITS;
  const limit = TIER_LIMITS[tierLower] ?? TIER_LIMITS.free;

  // Enforce tier limit
  if (currentCount >= limit) {
    throw new TierLimitError(
      `Watchlist limit reached for ${userTier.toUpperCase()} tier`,
      {
        current_count: currentCount,
        max_allowed: limit,
        tier: userTier,
      }
    );
  }

  // Insert into watchlist (or do nothing if already exists due to composite PK)
  try {
    const result = await db
      .insert(watchlistItems)
      .values({
        userId,
        stockId: stock.id,
      })
      .returning();

    return {
      ...stock,
      added_at: result[0]!.addedAt,
    };
  } catch (error: any) {
    // If duplicate key error (already in watchlist), just return the stock
    if (error.code === '23505') {
      const existingResult = await db
        .select()
        .from(watchlistItems)
        .where(
          and(
            eq(watchlistItems.userId, userId),
            eq(watchlistItems.stockId, stock.id)
          )
        )
        .limit(1);

      return {
        ...stock,
        added_at: existingResult[0]!.addedAt,
      };
    }
    throw error;
  }
}

/**
 * Remove a stock from user's watchlist
 */
export async function removeFromWatchlist(userId: string, ticker: string) {
  if (!db) {
    throw new InternalError('Database not available');
  }

  // Normalize ticker to uppercase
  const normalizedTicker = ticker.toUpperCase();

  // Find the stock by ticker
  const stockResult = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, normalizedTicker))
    .limit(1);

  if (stockResult.length === 0) {
    throw new NotFoundError(`Stock with ticker '${normalizedTicker}' not found`);
  }

  const stock = stockResult[0]!;

  // Delete from watchlist
  const result = await db
    .delete(watchlistItems)
    .where(
      and(
        eq(watchlistItems.userId, userId),
        eq(watchlistItems.stockId, stock.id)
      )
    )
    .returning();

  // If nothing was deleted, the item wasn't in the watchlist
  if (result.length === 0) {
    throw new NotFoundError(`Stock '${normalizedTicker}' is not in your watchlist`);
  }

  return { deleted: true };
}

/**
 * Check if a stock is in user's watchlist
 */
export async function isInWatchlist(userId: string, stockId: string): Promise<boolean> {
  if (!db) {
    return false;
  }

  const result = await db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.userId, userId),
        eq(watchlistItems.stockId, stockId)
      )
    )
    .limit(1);

  return result.length > 0;
}
