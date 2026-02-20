/**
 * Market Data Service
 *
 * Fetches fresh stock data from Yahoo Finance and updates the database.
 * Used by the cron system to keep prices, financials, and volume current.
 *
 * Uses two Yahoo Finance APIs:
 * - quote: Fast, provides price, volume, market cap, shares outstanding
 * - quoteSummary(financialData + defaultKeyStatistics): Cash, debt, revenue, insider %
 */

import YahooFinance from 'yahoo-finance2';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, financialData } from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** Yahoo Finance ticker suffix by exchange */
const EXCHANGE_SUFFIX: Record<string, string> = {
  TSX: '.TO',
  TSXV: '.V',
  CSE: '.CN',
};

/** Safe number conversion */
function safeNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? null : n;
}

/** Safe integer conversion */
function safeInt(val: unknown): number | null {
  const n = safeNum(val);
  return n === null ? null : Math.round(n);
}

export interface MarketDataResult {
  ticker: string;
  updated: boolean;
  error?: string;
}

/**
 * Fetch fresh market data for a single stock from Yahoo Finance
 * and update the stocks + financial_data tables.
 */
export async function refreshMarketData(ticker: string, exchange: string): Promise<MarketDataResult> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const suffix = EXCHANGE_SUFFIX[exchange] || '.TO';
  const yfTicker = `${ticker}${suffix}`;

  try {
    // Fetch quote (price/volume/cap) and quoteSummary (financials) in parallel
    const [quoteResult, summaryResult] = await Promise.all([
      yf.quote(yfTicker).catch(() => null),
      yf.quoteSummary(yfTicker, {
        modules: ['financialData', 'defaultKeyStatistics'],
      }).catch(() => null),
    ]);

    if (!quoteResult) {
      return { ticker, updated: false, error: 'No quote data returned' };
    }

    const currentPrice = safeNum(quoteResult.regularMarketPrice);
    const previousClose = safeNum(quoteResult.regularMarketPreviousClose);
    const marketCap = safeNum(quoteResult.marketCap);

    if (currentPrice === null && marketCap === null) {
      return { ticker, updated: false, error: 'No market data' };
    }

    const priceChange = currentPrice !== null && previousClose !== null
      ? Math.round((currentPrice - previousClose) * 10000) / 10000
      : null;

    // Extract financial data from quoteSummary
    const fd = summaryResult?.financialData;
    const ks = summaryResult?.defaultKeyStatistics;

    const totalCash = safeNum(fd?.totalCash);
    const totalDebt = safeNum(fd?.totalDebt);
    const totalRevenue = safeNum(fd?.totalRevenue);

    // Monthly burn: approximate from operating cashflow
    const operatingCashflow = safeNum(fd?.operatingCashflow);
    const ebitda = safeNum(fd?.ebitda);
    let monthlyBurn: number | null = null;
    if (operatingCashflow !== null) {
      // Positive cashflow = profitable (negative burn), negative = cash burn
      monthlyBurn = Math.round((-operatingCashflow / 12) * 100) / 100;
    } else if (ebitda !== null) {
      monthlyBurn = Math.round((-ebitda / 12) * 100) / 100;
    }

    const sharesOutstanding = safeInt(ks?.sharesOutstanding ?? quoteResult.sharesOutstanding);
    const heldPercentInsiders = safeNum(ks?.heldPercentInsiders);
    const insiderShares = sharesOutstanding !== null && heldPercentInsiders !== null
      ? Math.round(sharesOutstanding * heldPercentInsiders)
      : null;

    // Use averageDailyVolume3Month from quote (better than single-day volume)
    const avgVol30d = safeNum(
      (quoteResult as Record<string, unknown>).averageDailyVolume3Month
      ?? (quoteResult as Record<string, unknown>).averageDailyVolume10Day
    );

    // 1. Update stocks table
    const nameUpdate = quoteResult.shortName || quoteResult.longName;
    await db
      .update(stocks)
      .set({
        ...(nameUpdate ? { name: nameUpdate } : {}),
        marketCap,
        price: currentPrice,
        priceChange,
        updatedAt: new Date(),
      })
      .where(eq(stocks.ticker, ticker));

    // 2. Get stock ID for financial_data update
    const stockRows = await db
      .select({ id: stocks.id })
      .from(stocks)
      .where(eq(stocks.ticker, ticker))
      .limit(1);

    if (stockRows.length === 0) {
      return { ticker, updated: false, error: 'Stock not found in DB' };
    }

    const stockId = stockRows[0].id;

    // 3. Upsert financial_data — only overwrite fields where we have fresh data
    await db
      .insert(financialData)
      .values({
        stockId,
        cash: totalCash,
        monthlyBurn,
        totalDebt,
        revenue: totalRevenue,
        sharesCurrent: sharesOutstanding,
        insiderShares,
        totalShares: sharesOutstanding,
        avgVol30d,
      })
      .onConflictDoUpdate({
        target: financialData.stockId,
        set: {
          ...(totalCash !== null ? { cash: totalCash } : {}),
          ...(monthlyBurn !== null ? { monthlyBurn } : {}),
          ...(totalDebt !== null ? { totalDebt } : {}),
          ...(totalRevenue !== null ? { revenue: totalRevenue } : {}),
          ...(sharesOutstanding !== null ? { sharesCurrent: sharesOutstanding, totalShares: sharesOutstanding } : {}),
          ...(insiderShares !== null ? { insiderShares } : {}),
          ...(avgVol30d !== null ? { avgVol30d } : {}),
          updatedAt: new Date(),
        },
      });

    return { ticker, updated: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ticker, updated: false, error: msg };
  }
}
