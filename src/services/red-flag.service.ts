import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, filings, executives } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

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
