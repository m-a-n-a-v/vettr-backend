import { eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, redFlagHistory } from '../db/schema/index.js';
import { getWatchlist } from './watchlist.service.js';
import { detectRedFlags, type DetectedFlagResult, type RedFlagDetail } from './red-flag.service.js';
import * as cache from './cache.service.js';
import { InternalError } from '../utils/errors.js';

// --- Types ---

interface WatchlistHealth {
  elite: { count: number; pct: number };
  contender: { count: number; pct: number };
  watchlist: { count: number; pct: number };
  speculative: { count: number; pct: number };
  toxic: { count: number; pct: number };
}

interface SectorExposure {
  sector: string;
  exchange: string;
  count: number;
  pct: number;
}

interface RedFlagCategoryItem {
  category: string;
  label: string;
  stock_count: number;
  severity: 'critical' | 'warning';
}

interface LatestAlert {
  ticker: string;
  label: string;
  description: string;
  is_new: boolean;
}

interface RedFlagCategories {
  critical_count: number;
  warning_count: number;
  categories: RedFlagCategoryItem[];
  latest_alert: LatestAlert | null;
}

export interface PulseSummary {
  watchlist_health: WatchlistHealth;
  sector_exposure: SectorExposure[];
  red_flag_categories: RedFlagCategories;
}

// --- Constants ---

const PULSE_CACHE_TTL = 5 * 60; // 5 minutes

// Red flag type → category mapping
const FLAG_CATEGORY_MAP: Record<string, { category: string; label: string }> = {
  debt_trend: { category: 'Financial Risk', label: 'High Debt' },
  financing_velocity: { category: 'Financial Risk', label: 'Frequent Financing' },
  executive_churn: { category: 'Governance', label: 'Executive Turnover' },
  disclosure_gaps: { category: 'Governance', label: 'Disclosure Gaps' },
  consolidation_velocity: { category: 'Momentum', label: 'Share Consolidation' },
};

// --- Main Function ---

/**
 * Get pulse summary for a user's watchlist.
 * Aggregates watchlist health, sector exposure, and red flag categories.
 * Cached in Redis for 5 minutes per user.
 */
export async function getPulseSummary(userId: string): Promise<PulseSummary> {
  const cacheKey = `pulse_summary:${userId}`;

  // Check cache first
  const cached = await cache.get<PulseSummary>(cacheKey);
  if (cached) {
    return cached;
  }

  // Get user's watchlist stocks
  const watchlist = await getWatchlist(userId);

  // If empty watchlist, return zeros
  if (watchlist.length === 0) {
    const empty: PulseSummary = {
      watchlist_health: {
        elite: { count: 0, pct: 0 },
        contender: { count: 0, pct: 0 },
        watchlist: { count: 0, pct: 0 },
        speculative: { count: 0, pct: 0 },
        toxic: { count: 0, pct: 0 },
      },
      sector_exposure: [],
      red_flag_categories: {
        critical_count: 0,
        warning_count: 0,
        categories: [],
        latest_alert: null,
      },
    };
    await cache.set(cacheKey, empty, PULSE_CACHE_TTL);
    return empty;
  }

  // Compute all 3 sections in parallel
  const [watchlistHealth, sectorExposure, redFlagCategories] = await Promise.all([
    computeWatchlistHealth(watchlist),
    computeSectorExposure(watchlist),
    computeRedFlagCategories(watchlist),
  ]);

  const result: PulseSummary = {
    watchlist_health: watchlistHealth,
    sector_exposure: sectorExposure,
    red_flag_categories: redFlagCategories,
  };

  // Cache the result
  await cache.set(cacheKey, result, PULSE_CACHE_TTL);

  return result;
}

// --- Watchlist Health ---

/**
 * Group stocks by VETR score thresholds (5 tiers):
 * - Elite (Strong Buy): score >= 90
 * - Contender (Accumulate): score 75-89
 * - Watchlist (Hold): score 50-74
 * - Speculative (Avoid): score 30-49
 * - Toxic (Strong Sell): score < 30
 */
function computeWatchlistHealth(watchlist: any[]): WatchlistHealth {
  const total = watchlist.length;
  let elite = 0;
  let contender = 0;
  let watchlistCount = 0;
  let speculative = 0;
  let toxic = 0;

  for (const stock of watchlist) {
    const score = stock.vetrScore ?? 0;
    if (score >= 90) {
      elite++;
    } else if (score >= 75) {
      contender++;
    } else if (score >= 50) {
      watchlistCount++;
    } else if (score >= 30) {
      speculative++;
    } else {
      toxic++;
    }
  }

  return {
    elite: {
      count: elite,
      pct: total > 0 ? Math.round((elite / total) * 100) : 0,
    },
    contender: {
      count: contender,
      pct: total > 0 ? Math.round((contender / total) * 100) : 0,
    },
    watchlist: {
      count: watchlistCount,
      pct: total > 0 ? Math.round((watchlistCount / total) * 100) : 0,
    },
    speculative: {
      count: speculative,
      pct: total > 0 ? Math.round((speculative / total) * 100) : 0,
    },
    toxic: {
      count: toxic,
      pct: total > 0 ? Math.round((toxic / total) * 100) : 0,
    },
  };
}

// --- Sector Exposure ---

/**
 * Group watchlist stocks by sector, computing count and percentage.
 * Returns sorted by count descending.
 */
function computeSectorExposure(watchlist: any[]): SectorExposure[] {
  const total = watchlist.length;
  const sectorMap = new Map<string, { count: number; exchange: string }>();

  for (const stock of watchlist) {
    const sector = stock.sector || 'Other';
    const existing = sectorMap.get(sector);
    if (existing) {
      existing.count++;
    } else {
      sectorMap.set(sector, { count: 1, exchange: stock.exchange || '' });
    }
  }

  const exposure: SectorExposure[] = [];
  for (const [sector, data] of sectorMap.entries()) {
    exposure.push({
      sector,
      exchange: data.exchange,
      count: data.count,
      pct: total > 0 ? Math.round((data.count / total) * 100) : 0,
    });
  }

  // Sort by count descending
  exposure.sort((a, b) => b.count - a.count);

  return exposure;
}

// --- Red Flag Categories ---

/**
 * For each watchlist stock, detect red flags and categorize them into:
 * - Financial Risk: debt_trend + financing_velocity
 * - Governance: executive_churn + disclosure_gaps
 * - Momentum: consolidation_velocity
 *
 * Count critical (flag score > 70) vs warning (flag score 40-70).
 * Find latest alert from red_flag_history table for watchlist tickers.
 */
async function computeRedFlagCategories(watchlist: any[]): Promise<RedFlagCategories> {
  // Detect red flags for all watchlist stocks in parallel
  // detectRedFlags() already has 24h Redis cache per stock
  const tickers = watchlist.map((s) => s.ticker as string);

  const redFlagResults: DetectedFlagResult[] = [];
  // Process in batches of 5 to avoid overwhelming the system
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map((ticker) =>
        detectRedFlags(ticker).catch((err) => {
          console.error(`Failed to detect red flags for ${ticker}:`, err);
          return null;
        })
      )
    );
    for (const result of batchResults) {
      if (result) {
        redFlagResults.push(result);
      }
    }
  }

  // Aggregate flag categories
  let criticalCount = 0;
  let warningCount = 0;

  // Track per-category data: { category -> { stockTickers: Set, maxSeverity } }
  const categoryAgg = new Map<
    string,
    { label: string; stockTickers: Set<string>; hasCritical: boolean }
  >();

  for (const result of redFlagResults) {
    for (const flag of result.flags) {
      // Only count flags with score > 40 as active
      if (flag.score <= 40) continue;

      const mapping = FLAG_CATEGORY_MAP[flag.flag_type];
      if (!mapping) continue;

      const isCritical = flag.score > 70;
      if (isCritical) {
        criticalCount++;
      } else {
        warningCount++;
      }

      const existing = categoryAgg.get(mapping.category);
      if (existing) {
        existing.stockTickers.add(result.ticker);
        if (isCritical) existing.hasCritical = true;
      } else {
        categoryAgg.set(mapping.category, {
          label: mapping.label,
          stockTickers: new Set([result.ticker]),
          hasCritical: isCritical,
        });
      }
    }
  }

  // Build category items
  const categories: RedFlagCategoryItem[] = [];
  for (const [category, data] of categoryAgg.entries()) {
    categories.push({
      category,
      label: data.label,
      stock_count: data.stockTickers.size,
      severity: data.hasCritical ? 'critical' : 'warning',
    });
  }

  // Sort: critical first, then by stock count
  categories.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.stock_count - a.stock_count;
  });

  // Find latest alert from red_flag_history for watchlist tickers
  let latestAlert: LatestAlert | null = null;

  if (db && tickers.length > 0) {
    try {
      const latestRows = await db
        .select({
          stockTicker: redFlagHistory.stockTicker,
          flagType: redFlagHistory.flagType,
          description: redFlagHistory.description,
          detectedAt: redFlagHistory.detectedAt,
        })
        .from(redFlagHistory)
        .where(inArray(redFlagHistory.stockTicker, tickers))
        .orderBy(desc(redFlagHistory.detectedAt))
        .limit(1);

      if (latestRows.length > 0) {
        const row = latestRows[0]!;
        const mapping = FLAG_CATEGORY_MAP[row.flagType];
        const daysSince = Math.floor(
          (Date.now() - row.detectedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        latestAlert = {
          ticker: row.stockTicker,
          label: mapping?.label ?? row.flagType,
          description: row.description,
          is_new: daysSince <= 7,
        };
      }
    } catch (err) {
      console.error('Failed to fetch latest red flag alert:', err);
    }
  }

  return {
    critical_count: criticalCount,
    warning_count: warningCount,
    categories,
    latest_alert: latestAlert,
  };
}
