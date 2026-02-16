/**
 * Maps yfinance JSON data to VETTR database field formats.
 * Handles null coercion, type conversion, and field renaming.
 */

import type { YFinanceTickerData, StockUpsert, FinancialDataUpsert } from './types.js';

/** List of 25 pilot stock tickers that have rich seed data */
const PILOT_TICKERS = new Set([
  'NXE', 'ARIS', 'LUN', 'FM', 'TKO', 'ERO', 'CS', 'MAG', 'FVI', 'WPM',
  'AEM', 'OR', 'ELD', 'SII', 'BTO', 'NGD', 'IMG', 'MND', 'LUG', 'KRR',
  'RIO', 'SBB', 'GPL', 'FR', 'AG',
]);

/**
 * Check if a ticker is one of the 25 pilot stocks.
 * Pilot stocks have rich executive/filing data that should be preserved.
 */
export function isPilotStock(ticker: string): boolean {
  return PILOT_TICKERS.has(ticker.toUpperCase());
}

/**
 * Map yfinance data to a VETTR stock upsert record.
 */
export function mapToStockUpsert(data: YFinanceTickerData): StockUpsert {
  return {
    ticker: data.vettr_ticker.toUpperCase(),
    name: data.name || data.vettr_ticker,
    exchange: data.exchange,
    sector: data.sector || 'Other',
    marketCap: safeNumber(data.market_cap),
    price: safeNumber(data.price),
    priceChange: safeNumber(data.price_change),
    vetrScore: 0, // Will be calculated in Phase 4
  };
}

/**
 * Map yfinance data to a VETTR financial_data upsert record.
 * Requires stockId to be set after stock upsert.
 */
export function mapToFinancialDataUpsert(data: YFinanceTickerData, stockId: string): FinancialDataUpsert {
  return {
    stockId,
    cash: safeNumber(data.cash),
    monthlyBurn: safeNumber(data.monthly_burn),
    totalDebt: safeNumber(data.total_debt),
    totalAssets: safeNumber(data.total_assets),
    explorationExp: safeNumber(data.exploration_exp),
    rAndDExp: safeNumber(data.r_and_d_exp),
    totalOpex: safeNumber(data.total_opex),
    gAndAExpense: safeNumber(data.g_and_a_expense),
    revenue: safeNumber(data.revenue),
    sharesCurrent: safeInt(data.shares_current),
    shares1YrAgo: safeInt(data.shares_1yr_ago),
    insiderShares: safeInt(data.insider_shares),
    totalShares: safeInt(data.total_shares),
    avgVol30d: safeNumber(data.avg_vol_30d),
    daysSinceLastPr: safeIntOrNull(data.days_since_last_pr),
  };
}

/**
 * Map yfinance officers to VETTR executive insert records.
 * Returns sparse records with minimal data (yfinance only provides name + title).
 */
export function mapToExecutiveInserts(data: YFinanceTickerData, stockId: string) {
  if (!data.officers || data.officers.length === 0) {
    return [];
  }

  return data.officers.map((officer) => ({
    stockId,
    name: officer.name || 'Unknown',
    title: officer.title || 'Officer',
    yearsAtCompany: 0,
    previousCompanies: [] as string[],
    education: null as string | null,
    specialization: null as string | null,
    socialLinkedin: null as string | null,
    socialTwitter: null as string | null,
  }));
}

// --- Helpers ---

/** Convert to number or null (handles NaN, undefined, non-numeric) */
function safeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}

/** Convert to integer or null */
function safeInt(val: unknown): number | null {
  const num = safeNumber(val);
  if (num === null) return null;
  return Math.round(num);
}

/** Convert to integer or null (for optional integer fields) */
function safeIntOrNull(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return null;
  return Math.round(num);
}
