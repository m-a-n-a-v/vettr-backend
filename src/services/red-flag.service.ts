import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, filings, executives, redFlagHistory } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';
import * as cache from './cache.service.js';
import type { PaginationMeta } from '../types/pagination.js';

// Types for data rows
type StockRow = typeof stocks.$inferSelect;
type FilingRow = typeof filings.$inferSelect;
type ExecutiveRow = typeof executives.$inferSelect;

// --- Red Flag Result Types ---

export interface RedFlagDetail {
  flag_type: string;
  score: number;
  weight: number;
  weighted_score: number;
  description: string;
}

export interface DetectedFlagResult {
  ticker: string;
  composite_score: number;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  flags: RedFlagDetail[];
  detected_at: string;
}

// --- Data Fetching Helpers ---

/**
 * Get a stock record by ticker from the database.
 */
async function getStockByTicker(ticker: string): Promise<StockRow | null> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const result = await db
    .select()
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get filings for a stock ticker from the database.
 */
async function getFilingsForTicker(ticker: string): Promise<FilingRow[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const stock = await db
    .select({ id: stocks.id })
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  if (stock.length === 0) {
    return [];
  }

  return db
    .select()
    .from(filings)
    .where(eq(filings.stockId, stock[0].id))
    .orderBy(desc(filings.date));
}

/**
 * Get executives for a stock ticker from the database.
 */
async function getExecutivesForTicker(ticker: string): Promise<ExecutiveRow[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const stock = await db
    .select({ id: stocks.id })
    .from(stocks)
    .where(eq(stocks.ticker, ticker.toUpperCase()))
    .limit(1);

  if (stock.length === 0) {
    return [];
  }

  return db
    .select()
    .from(executives)
    .where(eq(executives.stockId, stock[0].id))
    .orderBy(desc(executives.yearsAtCompany));
}

// --- Red Flag Detector: Consolidation Velocity (weight: 30%) ---

/**
 * Detect Consolidation Velocity red flag.
 *
 * Measures the frequency of acquisition/consolidation activity based on filings.
 * Looks for press releases and filings mentioning acquisitions, mergers, or consolidation
 * in the last 12 months.
 *
 * Scoring:
 * - 1 event → 20pts
 * - 2 events → 40pts
 * - 3 events → 60pts
 * - 4 events → 80pts
 * - 5+ events → 100pts
 *
 * Weight: 30%
 *
 * @param stockTicker - Stock ticker symbol
 * @returns RedFlagDetail with score and description
 */
export async function detectConsolidationVelocity(stockTicker: string): Promise<RedFlagDetail> {
  const upperTicker = stockTicker.toUpperCase();
  const filingList = await getFilingsForTicker(upperTicker);

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Filter filings from last 12 months that indicate consolidation/acquisition activity
  const consolidationKeywords = [
    'acquisition', 'acquire', 'merger', 'merge', 'consolidat',
    'takeover', 'buyout', 'amalgamat',
  ];

  const consolidationEvents = filingList.filter((f) => {
    if (f.date < oneYearAgo) return false;
    const titleLower = f.title?.toLowerCase() ?? '';
    const summaryLower = f.summary?.toLowerCase() ?? '';
    return consolidationKeywords.some(
      (kw) => titleLower.includes(kw) || summaryLower.includes(kw)
    );
  });

  const eventCount = consolidationEvents.length;
  let score: number;

  if (eventCount === 0) {
    score = 0;
  } else if (eventCount === 1) {
    score = 20;
  } else if (eventCount === 2) {
    score = 40;
  } else if (eventCount === 3) {
    score = 60;
  } else if (eventCount === 4) {
    score = 80;
  } else {
    score = 100;
  }

  const weight = 0.30;

  return {
    flag_type: 'consolidation_velocity',
    score,
    weight,
    weighted_score: Math.round(score * weight),
    description:
      eventCount === 0
        ? 'No consolidation activity detected in the last 12 months'
        : `${eventCount} consolidation/acquisition event${eventCount > 1 ? 's' : ''} detected in the last 12 months`,
  };
}

// --- Red Flag Detector: Financing Velocity (weight: 25%) ---

/**
 * Detect Financing Velocity red flag.
 *
 * Measures the pace and volume of financing activity relative to company stage.
 * Early-stage companies (market cap < $500M) have a $50M threshold;
 * growth-stage companies (market cap >= $500M) have a $100M threshold.
 *
 * Uses filing data to estimate financing activity — counts financing-related filings
 * (private placements, prospectus, capital raises) and uses market cap as a proxy
 * for total capital raised.
 *
 * Scoring:
 * - Early-stage (market cap < $500M): score = min(100, (financingFilings / threshold) * 100)
 *   where threshold is based on $50M equivalent filing count (~3 filings)
 * - Growth-stage (market cap >= $500M): score = min(100, (financingFilings / threshold) * 100)
 *   where threshold is based on $100M equivalent filing count (~5 filings)
 *
 * Weight: 25%
 *
 * @param stockTicker - Stock ticker symbol
 * @returns RedFlagDetail with score and description
 */
export async function detectFinancingVelocity(stockTicker: string): Promise<RedFlagDetail> {
  const upperTicker = stockTicker.toUpperCase();

  const [stock, filingList] = await Promise.all([
    getStockByTicker(upperTicker),
    getFilingsForTicker(upperTicker),
  ]);

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Filter filings from last 12 months that indicate financing activity
  const financingKeywords = [
    'private placement', 'prospectus', 'offering', 'capital raise',
    'financing', 'equity', 'debenture', 'warrant', 'subscription',
    'bought deal', 'share issuance',
  ];

  const financingEvents = filingList.filter((f) => {
    if (f.date < oneYearAgo) return false;
    const titleLower = f.title?.toLowerCase() ?? '';
    const summaryLower = f.summary?.toLowerCase() ?? '';
    return financingKeywords.some(
      (kw) => titleLower.includes(kw) || summaryLower.includes(kw)
    );
  });

  const eventCount = financingEvents.length;
  const marketCap = stock?.marketCap ?? 0;
  const isEarlyStage = marketCap < 500_000_000;

  // Threshold: early-stage ~3 financing events/year is concerning ($50M equiv),
  // growth-stage ~5 events/year is concerning ($100M equiv)
  const threshold = isEarlyStage ? 3 : 5;
  const score = Math.min(100, Math.round((eventCount / threshold) * 100));

  const weight = 0.25;
  const stage = isEarlyStage ? 'early-stage' : 'growth-stage';

  return {
    flag_type: 'financing_velocity',
    score,
    weight,
    weighted_score: Math.round(score * weight),
    description:
      eventCount === 0
        ? `No financing activity detected in the last 12 months (${stage})`
        : `${eventCount} financing event${eventCount > 1 ? 's' : ''} detected in the last 12 months for ${stage} company (threshold: ${threshold})`,
  };
}

// --- Red Flag Detector: Executive Churn (weight: 20%) ---

/**
 * Detect Executive Churn red flag.
 *
 * Measures the rate of executive turnover by looking at executives with
 * low tenure (less than 1 year at the company), which indicates recent
 * departures and replacements.
 *
 * Scoring:
 * - 1 recent change → 25pts
 * - 2 recent changes → 50pts
 * - 3 recent changes → 75pts
 * - 4+ recent changes → 100pts
 *
 * Weight: 20%
 *
 * @param stockTicker - Stock ticker symbol
 * @returns RedFlagDetail with score and description
 */
export async function detectExecutiveChurn(stockTicker: string): Promise<RedFlagDetail> {
  const upperTicker = stockTicker.toUpperCase();
  const executiveList = await getExecutivesForTicker(upperTicker);

  // Executives with less than 1 year tenure indicate recent churn
  const recentChanges = executiveList.filter((e) => e.yearsAtCompany < 1);
  const churnCount = recentChanges.length;

  let score: number;

  if (churnCount === 0) {
    score = 0;
  } else if (churnCount === 1) {
    score = 25;
  } else if (churnCount === 2) {
    score = 50;
  } else if (churnCount === 3) {
    score = 75;
  } else {
    score = 100;
  }

  const weight = 0.20;

  return {
    flag_type: 'executive_churn',
    score,
    weight,
    weighted_score: Math.round(score * weight),
    description:
      churnCount === 0
        ? 'No significant executive turnover detected'
        : `${churnCount} executive${churnCount > 1 ? 's' : ''} with less than 1 year tenure (indicates recent turnover)`,
  };
}

// --- Red Flag Detector: Disclosure Gaps (weight: 15%) ---

/**
 * Detect Disclosure Gaps red flag.
 *
 * Measures the gap between the most recent filing and the current date.
 * Longer gaps indicate potential disclosure issues or regulatory non-compliance.
 *
 * Scoring:
 * - Overdue (no filings in 120+ days) → 100pts
 * - 90+ days since last filing → 75pts
 * - 60-89 days → 50pts
 * - 30-59 days → 25pts
 * - Less than 30 days → 0pts
 *
 * Weight: 15%
 *
 * @param stockTicker - Stock ticker symbol
 * @returns RedFlagDetail with score and description
 */
export async function detectDisclosureGaps(stockTicker: string): Promise<RedFlagDetail> {
  const upperTicker = stockTicker.toUpperCase();
  const filingList = await getFilingsForTicker(upperTicker);

  const weight = 0.15;

  // If no filings at all, consider it overdue
  if (filingList.length === 0) {
    return {
      flag_type: 'disclosure_gaps',
      score: 100,
      weight,
      weighted_score: Math.round(100 * weight),
      description: 'No filings found — disclosure status unknown (treated as overdue)',
    };
  }

  // filingList is ordered by date DESC, so first entry is most recent
  const mostRecentFiling = filingList[0];
  const now = new Date();
  const daysSinceLastFiling = Math.floor(
    (now.getTime() - mostRecentFiling.date.getTime()) / (1000 * 60 * 60 * 24)
  );

  let score: number;
  let description: string;

  if (daysSinceLastFiling >= 120) {
    score = 100;
    description = `Overdue: ${daysSinceLastFiling} days since last filing`;
  } else if (daysSinceLastFiling >= 90) {
    score = 75;
    description = `${daysSinceLastFiling} days since last filing (90+ day gap)`;
  } else if (daysSinceLastFiling >= 60) {
    score = 50;
    description = `${daysSinceLastFiling} days since last filing (60-89 day gap)`;
  } else if (daysSinceLastFiling >= 30) {
    score = 25;
    description = `${daysSinceLastFiling} days since last filing (30-59 day gap)`;
  } else {
    score = 0;
    description = `Last filing ${daysSinceLastFiling} days ago — disclosures are current`;
  }

  return {
    flag_type: 'disclosure_gaps',
    score,
    weight,
    weighted_score: Math.round(score * weight),
    description,
  };
}

// --- Red Flag Detector: Debt Trend (weight: 10%) ---

/**
 * Detect Debt Trend red flag.
 *
 * Analyzes filing content for signs of increasing debt burden relative to revenue growth.
 * Uses filing keywords to detect debt-related activity and revenue growth signals.
 *
 * Since explicit financial data (debt, revenue) is not stored in the schema,
 * this detector uses filing content analysis as a proxy:
 * - Counts debt-related filings (debentures, credit facilities, debt restructuring)
 * - Counts revenue-positive filings (revenue growth, earnings, profit)
 * - High debt activity with low revenue signals = high risk
 *
 * Scoring:
 * - 100%+ debt signals with <20% revenue signals → 100pts
 * - 75%+ debt signals → 75pts
 * - 50%+ debt signals → 50pts
 * - 25%+ debt signals → 25pts
 * - Less → 0pts
 *
 * Weight: 10%
 *
 * @param stockTicker - Stock ticker symbol
 * @returns RedFlagDetail with score and description
 */
export async function detectDebtTrend(stockTicker: string): Promise<RedFlagDetail> {
  const upperTicker = stockTicker.toUpperCase();
  const filingList = await getFilingsForTicker(upperTicker);

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const recentFilings = filingList.filter((f) => f.date >= oneYearAgo);
  const weight = 0.10;

  if (recentFilings.length === 0) {
    return {
      flag_type: 'debt_trend',
      score: 0,
      weight,
      weighted_score: 0,
      description: 'No recent filings to assess debt trend',
    };
  }

  // Debt-related keywords
  const debtKeywords = [
    'debenture', 'credit facility', 'credit agreement', 'loan',
    'debt', 'borrowing', 'leverage', 'restructuring',
    'default', 'covenant', 'interest payment',
  ];

  // Revenue-positive keywords
  const revenueKeywords = [
    'revenue growth', 'revenue increase', 'earnings growth',
    'profit', 'positive cash flow', 'record revenue',
    'strong quarter', 'beat estimates',
  ];

  const debtFilings = recentFilings.filter((f) => {
    const titleLower = f.title?.toLowerCase() ?? '';
    const summaryLower = f.summary?.toLowerCase() ?? '';
    return debtKeywords.some(
      (kw) => titleLower.includes(kw) || summaryLower.includes(kw)
    );
  });

  const revenueFilings = recentFilings.filter((f) => {
    const titleLower = f.title?.toLowerCase() ?? '';
    const summaryLower = f.summary?.toLowerCase() ?? '';
    return revenueKeywords.some(
      (kw) => titleLower.includes(kw) || summaryLower.includes(kw)
    );
  });

  const totalFilings = recentFilings.length;
  const debtRatio = debtFilings.length / totalFilings;
  const revenueRatio = revenueFilings.length / totalFilings;

  let score: number;
  let description: string;

  // High debt activity with low revenue growth is the most concerning
  if (debtRatio >= 0.5 && revenueRatio < 0.2) {
    score = 100;
    description = `High debt activity (${debtFilings.length}/${totalFilings} filings) with minimal revenue growth signals — significant debt concern`;
  } else if (debtRatio >= 0.375) {
    score = 75;
    description = `Elevated debt activity (${debtFilings.length}/${totalFilings} filings) detected in recent filings`;
  } else if (debtRatio >= 0.25) {
    score = 50;
    description = `Moderate debt activity (${debtFilings.length}/${totalFilings} filings) detected in recent filings`;
  } else if (debtRatio >= 0.125) {
    score = 25;
    description = `Minor debt activity (${debtFilings.length}/${totalFilings} filings) detected in recent filings`;
  } else {
    score = 0;
    description = 'No significant debt trend concerns detected';
  }

  return {
    flag_type: 'debt_trend',
    score,
    weight,
    weighted_score: Math.round(score * weight),
    description,
  };
}

// --- Severity Classification ---

/**
 * Classify severity based on composite score.
 *
 * - Low: < 30
 * - Moderate: 30-60
 * - High: 60-85
 * - Critical: > 85
 */
function classifySeverity(compositeScore: number): DetectedFlagResult['severity'] {
  if (compositeScore > 85) return 'Critical';
  if (compositeScore >= 60) return 'High';
  if (compositeScore >= 30) return 'Moderate';
  return 'Low';
}

// --- Composite Red Flag Detection ---

const RED_FLAG_CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

/**
 * Detect all red flags for a stock ticker.
 *
 * Runs all 5 detectors in parallel, calculates the weighted composite score,
 * determines severity, caches the result in Redis (24h TTL), and saves
 * individual flags to the red_flag_history table.
 *
 * @param ticker - Stock ticker symbol
 * @returns DetectedFlagResult with composite score, severity, and per-flag breakdown
 */
export async function detectRedFlags(ticker: string): Promise<DetectedFlagResult> {
  const upperTicker = ticker.toUpperCase();
  const cacheKey = `red_flags:${upperTicker}`;

  // Check cache first
  const cached = await cache.get<DetectedFlagResult>(cacheKey);
  if (cached) {
    return cached;
  }

  // Verify the stock exists
  const stock = await getStockByTicker(upperTicker);
  if (!stock) {
    throw new NotFoundError(`Stock with ticker '${upperTicker}' not found`);
  }

  // Run all 5 detectors in parallel
  const [consolidation, financing, executiveChurn, disclosureGaps, debtTrend] =
    await Promise.all([
      detectConsolidationVelocity(upperTicker),
      detectFinancingVelocity(upperTicker),
      detectExecutiveChurn(upperTicker),
      detectDisclosureGaps(upperTicker),
      detectDebtTrend(upperTicker),
    ]);

  const flags: RedFlagDetail[] = [
    consolidation,
    financing,
    executiveChurn,
    disclosureGaps,
    debtTrend,
  ];

  // Composite score = sum of weighted scores
  const compositeScore = Math.round(
    flags.reduce((sum, flag) => sum + flag.score * flag.weight, 0)
  );

  const severity = classifySeverity(compositeScore);
  const detectedAt = new Date().toISOString();

  const result: DetectedFlagResult = {
    ticker: upperTicker,
    composite_score: compositeScore,
    severity,
    flags,
    detected_at: detectedAt,
  };

  // Cache the result with 24h TTL
  await cache.set(cacheKey, result, RED_FLAG_CACHE_TTL);

  // Save individual flags to red_flag_history table
  await saveRedFlagsToHistory(upperTicker, flags, severity, detectedAt);

  return result;
}

/**
 * Save individual red flag detections to the red_flag_history table.
 */
async function saveRedFlagsToHistory(
  stockTicker: string,
  flags: RedFlagDetail[],
  overallSeverity: DetectedFlagResult['severity'],
  detectedAt: string,
): Promise<void> {
  if (!db) {
    return;
  }

  try {
    const detectedDate = new Date(detectedAt);
    const records = flags.map((flag) => ({
      stockTicker,
      flagType: flag.flag_type,
      severity: classifySeverity(flag.score) as string,
      score: flag.score,
      description: flag.description,
      detectedAt: detectedDate,
    }));

    await db.insert(redFlagHistory).values(records);
  } catch (error) {
    // Log but don't fail the detection if history save fails
    console.error(`Failed to save red flag history for ${stockTicker}:`, error);
  }
}

// --- History Query Functions ---

/**
 * Get paginated red flag history for a specific stock ticker.
 */
export async function getRedFlagHistoryForStock(
  ticker: string,
  options: { limit: number; offset: number },
): Promise<{ flags: (typeof redFlagHistory.$inferSelect)[]; pagination: PaginationMeta }> {
  const upperTicker = ticker.toUpperCase();

  // Verify the stock exists
  const stock = await getStockByTicker(upperTicker);
  if (!stock) {
    throw new NotFoundError(`Stock with ticker '${upperTicker}' not found`);
  }

  if (!db) {
    throw new InternalError('Database not available');
  }

  const [countResult, flags] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(redFlagHistory)
      .where(eq(redFlagHistory.stockTicker, upperTicker)),
    db
      .select()
      .from(redFlagHistory)
      .where(eq(redFlagHistory.stockTicker, upperTicker))
      .orderBy(desc(redFlagHistory.detectedAt))
      .limit(options.limit)
      .offset(options.offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    flags,
    pagination: {
      total,
      limit: options.limit,
      offset: options.offset,
      has_more: options.offset + options.limit < total,
    },
  };
}

/**
 * Get paginated global red flag history across all stocks.
 */
export async function getGlobalRedFlagHistory(
  options: { limit: number; offset: number },
): Promise<{ flags: (typeof redFlagHistory.$inferSelect)[]; pagination: PaginationMeta }> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const [countResult, flags] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(redFlagHistory),
    db
      .select()
      .from(redFlagHistory)
      .orderBy(desc(redFlagHistory.detectedAt))
      .limit(options.limit)
      .offset(options.offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    flags,
    pagination: {
      total,
      limit: options.limit,
      offset: options.offset,
      has_more: options.offset + options.limit < total,
    },
  };
}
