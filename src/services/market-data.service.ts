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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import YahooFinance from 'yahoo-finance2';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, financialData, stockDailyPrices } from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';
import { calculateTrueRange } from '../utils/atr.js';

// yahoo-finance2 v3 exports a class constructor as default
// TypeScript CJS types don't reflect this, so we cast
const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] }) as InstanceType<any>;

/**
 * Retry a function with exponential backoff (1s, 2s delays).
 * Prevents transient Yahoo Finance failures from causing permanent data gaps.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
}

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
    // Both calls use retry with exponential backoff to handle transient Yahoo Finance errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [quoteResult, summaryResult]: [any, any] = await Promise.all([
      withRetry(() => yf.quote(yfTicker)).catch(() => null),
      withRetry(() => yf.quoteSummary(yfTicker, {
        modules: ['financialData', 'defaultKeyStatistics'],
      })).catch(() => null),
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

/**
 * Fetch 30 days of historical daily OHLC data from Yahoo Finance
 * and upsert into stock_daily_prices table.
 * Calculates True Range for each day during storage.
 */
export async function fetchAndStoreOHLC(
  ticker: string,
  exchange: string,
  stockId: string
): Promise<{ ticker: string; days: number; error?: string }> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const suffix = EXCHANGE_SUFFIX[exchange] || '.TO';
  const yfTicker = `${ticker}${suffix}`;

  try {
    // Fetch 30 days of historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 35); // extra buffer for weekends/holidays

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chartResult: any = await withRetry(() =>
      yf.chart(yfTicker, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      })
    );

    if (!chartResult?.quotes || chartResult.quotes.length === 0) {
      return { ticker, days: 0, error: 'No historical data returned' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = chartResult.quotes;
    let insertedDays = 0;

    for (let i = 0; i < quotes.length; i++) {
      const q = quotes[i];
      const high = safeNum(q.high);
      const low = safeNum(q.low);
      const close = safeNum(q.close);
      const open = safeNum(q.open);
      const volume = safeNum(q.volume);

      if (close === null || high === null || low === null) continue;

      // Previous close is either from previous day's quote or null for first day
      const prevClose = i > 0 ? safeNum(quotes[i - 1].close) : null;
      const trueRange = prevClose !== null ? calculateTrueRange(high, low, prevClose) : high - low;

      // Convert date to YYYY-MM-DD string
      const dateObj = new Date(q.date);
      const dateStr = dateObj.toISOString().split('T')[0];

      await db
        .insert(stockDailyPrices)
        .values({
          stockId,
          ticker,
          date: dateStr,
          open,
          high,
          low,
          close,
          previousClose: prevClose,
          volume,
          trueRange,
        })
        .onConflictDoUpdate({
          target: [stockDailyPrices.ticker, stockDailyPrices.date],
          set: {
            open,
            high,
            low,
            close,
            previousClose: prevClose,
            volume,
            trueRange,
          },
        });

      insertedDays++;
    }

    return { ticker, days: insertedDays };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ticker, days: 0, error: msg };
  }
}
