/**
 * Phase 6: Fetch financial statements, company profiles, and financial summaries.
 *
 * Fills 3 tables: company_profiles, financial_statements, financial_summary.
 *
 * Uses two Yahoo Finance APIs:
 *   1. quoteSummary — assetProfile, financialData, price, defaultKeyStatistics
 *   2. fundamentalsTimeSeries — financials, balance-sheet, cash-flow (annual + quarterly)
 *
 * The quoteSummary financial statement submodules (incomeStatementHistory, etc.)
 * have been deprecated since Nov 2024 — fundamentalsTimeSeries is the replacement.
 *
 * Features: same throttling, resume, and retry pattern as phase 5.
 *
 * Usage:
 *   node --env-file=.env.production node_modules/.bin/tsx scripts/ingest/06_fetch_financials.ts
 */

import YahooFinance from 'yahoo-finance2';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { db } from '../../src/config/database.js';
import {
  stocks,
  companyProfiles,
  financialStatements,
  financialSummary,
} from '../../src/db/schema/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ───────────────────────────────────────────────────────────

const YAHOO_CONCURRENCY = 2;       // Lower concurrency since each ticker makes 4 API calls
const YAHOO_DELAY_MS = 2000;       // 2s between batches (more calls per ticker)
const FTS_DELAY_MS = 500;          // 500ms between fundamentalsTimeSeries calls
const RETRY_DELAYS = [5000, 15000, 45000];
const PROGRESS_FILE = join(__dirname, 'data', 'financials_progress.json');
const LOG_FILE = join(__dirname, 'data', 'financials_log.txt');

const EXCHANGE_SUFFIX: Record<string, string> = {
  TSX: '.TO',
  TSXV: '.V',
  CSE: '.CN',
  NYSE: '',
};

// quoteSummary modules for profile + summary data (these still work)
const QUOTE_MODULES = [
  'assetProfile',
  'financialData',
  'price',
  'defaultKeyStatistics',
] as const;

const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] }) as InstanceType<any>;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProgressData {
  startedAt: string;
  lastUpdatedAt: string;
  totalTickers: number;
  completed: string[];
  failed: Record<string, string>;
  stats: {
    completed: number;
    failed: number;
    remaining: number;
    profiles: number;
    statements: number;
    summaries: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? null : n;
}

function safeInt(val: unknown): number | null {
  const n = safeNum(val);
  return n === null ? null : Math.round(n);
}

function safeStr(val: unknown, maxLen?: number): string | null {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val);
  return maxLen ? s.slice(0, maxLen) : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let startTime = Date.now();

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* ignore */ }
}

// ─── Progress Tracker ────────────────────────────────────────────────────────

function loadProgress(): ProgressData {
  if (existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8')) as ProgressData;
    } catch {
      log('Warning: Could not parse progress file, starting fresh');
    }
  }
  return {
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    totalTickers: 0,
    completed: [],
    failed: {},
    stats: { completed: 0, failed: 0, remaining: 0, profiles: 0, statements: 0, summaries: 0 },
  };
}

function saveProgress(progress: ProgressData): void {
  progress.lastUpdatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Yahoo Finance Fetchers with Retry ───────────────────────────────────────

async function fetchWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes('429') || msg.includes('Too Many') || msg.includes('rate')) {
        if (attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          log(`  [RETRY] ${label} rate-limited, retry in ${delay / 1000}s (attempt ${attempt + 1})`);
          await sleep(delay);
          continue;
        }
      }
      // Not a rate limit or out of retries
      return null;
    }
  }
  return null;
}

async function fetchQuoteSummary(yfTicker: string): Promise<any> {
  return fetchWithRetry(
    () => yf.quoteSummary(yfTicker, { modules: [...QUOTE_MODULES] }),
    `quoteSummary:${yfTicker}`,
  );
}

async function fetchTimeSeries(
  yfTicker: string,
  module: 'financials' | 'balance-sheet' | 'cash-flow',
  type: 'annual' | 'quarterly',
): Promise<any[]> {
  const result = await fetchWithRetry(
    () => yf.fundamentalsTimeSeries(yfTicker, {
      period1: '2020-01-01',
      type,
      module,
    }, { validateResult: false }),
    `fts:${yfTicker}:${module}:${type}`,
  );
  return Array.isArray(result) ? result : [];
}

// ─── Data Mappers ─────────────────────────────────────────────────────────────

function mapCompanyProfile(stockId: string, y: any): typeof companyProfiles.$inferInsert | null {
  const ap = y?.assetProfile;
  const pr = y?.price;
  if (!ap && !pr) return null;

  const officers = (ap?.companyOfficers ?? []).map((o: any) => ({
    name: String(o.name ?? 'Unknown'),
    title: String(o.title ?? 'Unknown'),
    age: o.age ? Number(o.age) : undefined,
    totalPay: o.totalPay ? Number(o.totalPay) : undefined,
  }));

  return {
    stockId,
    description: safeStr(ap?.longBusinessSummary),
    industry: safeStr(ap?.industry, 255) ?? safeStr(pr?.shortName, 255),
    subIndustry: safeStr(ap?.industryKey, 255),
    employees: safeInt(ap?.fullTimeEmployees),
    website: safeStr(ap?.website, 500),
    phone: safeStr(ap?.phone, 50),
    address: [ap?.address1, ap?.address2].filter(Boolean).join(', ') || null,
    city: safeStr(ap?.city, 100),
    state: safeStr(ap?.state, 100),
    country: safeStr(ap?.country, 100),
    zip: safeStr(ap?.zip, 20),
    currency: safeStr(pr?.currency, 10),
    exchangeName: safeStr(pr?.exchangeName, 100),
    quoteType: safeStr(pr?.quoteType, 50),
    officers: officers.length > 0 ? officers : null,
    updatedAt: new Date(),
  };
}

function mapFinancialSummary(stockId: string, y: any): typeof financialSummary.$inferInsert | null {
  const fd = y?.financialData;
  const ks = y?.defaultKeyStatistics;
  const pr = y?.price;
  if (!fd) return null;

  return {
    stockId,
    totalRevenue: safeNum(fd.totalRevenue),
    grossProfit: safeNum(fd.grossProfits),
    ebitda: safeNum(fd.ebitda),
    netIncome: safeNum(fd.netIncomeToCommon ?? ks?.netIncomeToCommon),
    operatingCashFlow: safeNum(fd.operatingCashflow),
    freeCashFlow: safeNum(fd.freeCashflow),
    totalCash: safeNum(fd.totalCash),
    totalCashPerShare: safeNum(fd.totalCashPerShare),
    totalDebt: safeNum(fd.totalDebt),
    revenuePerShare: safeNum(fd.revenuePerShare),
    grossMargins: safeNum(fd.grossMargins),
    operatingMargins: safeNum(fd.operatingMargins),
    ebitdaMargins: safeNum(fd.ebitdaMargins),
    revenueGrowth: safeNum(fd.revenueGrowth),
    earningsGrowth: safeNum(fd.earningsGrowth),
    currentRatio: safeNum(fd.currentRatio),
    quickRatio: safeNum(fd.quickRatio),
    sharesOutstanding: safeInt(ks?.sharesOutstanding ?? pr?.sharesOutstanding),
    floatShares: safeInt(ks?.floatShares),
    currency: safeStr(fd.financialCurrency, 10) ?? safeStr(pr?.currency, 10),
    updatedAt: new Date(),
  };
}

// Skip list: fields from fundamentalsTimeSeries that are metadata, not financial line items
const SKIP_FIELDS = new Set(['date', 'TYPE', 'periodType', 'currencyCode', 'maxAge', 'timestamp']);

function extractTimeSeriesRows(
  stockId: string,
  data: any[],
  statementType: string,
  periodType: string,
): Array<typeof financialStatements.$inferInsert> {
  const rows: Array<typeof financialStatements.$inferInsert> = [];

  for (const entry of data) {
    if (!entry || !entry.date) continue;

    // Extract date
    let fiscalDate: string;
    if (entry.date instanceof Date) {
      fiscalDate = entry.date.toISOString().slice(0, 10);
    } else {
      const d = new Date(entry.date);
      if (isNaN(d.getTime())) continue;
      fiscalDate = d.toISOString().slice(0, 10);
    }

    const currency = safeStr(entry.currencyCode, 10);

    // Extract all numeric fields as line items
    for (const [key, val] of Object.entries(entry)) {
      if (SKIP_FIELDS.has(key)) continue;
      if (val === null || val === undefined) continue;
      const numVal = Number(val);
      if (isNaN(numVal)) continue;

      rows.push({
        stockId,
        statementType,
        periodType,
        fiscalDate,
        lineItem: key,
        value: numVal,
        currency,
        updatedAt: new Date(),
      });
    }
  }

  return rows;
}

// ─── DB Upsert Functions ─────────────────────────────────────────────────────

async function upsertCompanyProfile(data: typeof companyProfiles.$inferInsert): Promise<void> {
  await db!.insert(companyProfiles).values(data).onConflictDoUpdate({
    target: companyProfiles.stockId,
    set: { ...data, createdAt: undefined, stockId: undefined },
  });
}

async function upsertFinancialSummary(data: typeof financialSummary.$inferInsert): Promise<void> {
  await db!.insert(financialSummary).values(data).onConflictDoUpdate({
    target: financialSummary.stockId,
    set: { ...data, createdAt: undefined, stockId: undefined },
  });
}

async function upsertFinancialStatements(stockId: string, rows: Array<typeof financialStatements.$inferInsert>): Promise<void> {
  if (rows.length === 0) return;

  // Deduplicate: Yahoo sometimes returns duplicate line items for the same period/date.
  // Keep the last occurrence (latest value wins).
  const deduped = new Map<string, typeof financialStatements.$inferInsert>();
  for (const row of rows) {
    const key = `${row.statementType}|${row.periodType}|${row.fiscalDate}|${row.lineItem}`;
    deduped.set(key, row);
  }
  const uniqueRows = Array.from(deduped.values());

  // Delete existing and re-insert
  await db!.delete(financialStatements).where(eq(financialStatements.stockId, stockId));

  // Insert in chunks of 100
  for (let i = 0; i < uniqueRows.length; i += 100) {
    await db!.insert(financialStatements).values(uniqueRows.slice(i, i + 100));
  }
}

// ─── Per-Ticker Orchestrator ─────────────────────────────────────────────────

async function processTicker(
  ticker: string,
  exchange: string,
  stockId: string,
): Promise<{ success: boolean; error?: string; profileOk: boolean; stmtCount: number; summaryOk: boolean }> {
  const suffix = EXCHANGE_SUFFIX[exchange] ?? '.TO';
  const yfTicker = `${ticker}${suffix}`;

  try {
    // 1. quoteSummary for profile + financial summary
    const qs = await fetchQuoteSummary(yfTicker);

    let profileOk = false;
    let summaryOk = false;

    if (qs) {
      const profile = mapCompanyProfile(stockId, qs);
      if (profile) {
        await upsertCompanyProfile(profile);
        profileOk = true;
      }

      const summary = mapFinancialSummary(stockId, qs);
      if (summary) {
        await upsertFinancialSummary(summary);
        summaryOk = true;
      }
    }

    // 2. fundamentalsTimeSeries for financial statements (sequential with delays)
    const allRows: Array<typeof financialStatements.$inferInsert> = [];

    // Annual financials (income statement)
    await sleep(FTS_DELAY_MS);
    const annualIncome = await fetchTimeSeries(yfTicker, 'financials', 'annual');
    allRows.push(...extractTimeSeriesRows(stockId, annualIncome, 'income', 'annual'));

    // Annual balance sheet
    await sleep(FTS_DELAY_MS);
    const annualBS = await fetchTimeSeries(yfTicker, 'balance-sheet', 'annual');
    allRows.push(...extractTimeSeriesRows(stockId, annualBS, 'balance_sheet', 'annual'));

    // Annual cash flow
    await sleep(FTS_DELAY_MS);
    const annualCF = await fetchTimeSeries(yfTicker, 'cash-flow', 'annual');
    allRows.push(...extractTimeSeriesRows(stockId, annualCF, 'cash_flow', 'annual'));

    // Quarterly financials
    await sleep(FTS_DELAY_MS);
    const qtrIncome = await fetchTimeSeries(yfTicker, 'financials', 'quarterly');
    allRows.push(...extractTimeSeriesRows(stockId, qtrIncome, 'income', 'quarterly'));

    // Quarterly balance sheet
    await sleep(FTS_DELAY_MS);
    const qtrBS = await fetchTimeSeries(yfTicker, 'balance-sheet', 'quarterly');
    allRows.push(...extractTimeSeriesRows(stockId, qtrBS, 'balance_sheet', 'quarterly'));

    // Quarterly cash flow
    await sleep(FTS_DELAY_MS);
    const qtrCF = await fetchTimeSeries(yfTicker, 'cash-flow', 'quarterly');
    allRows.push(...extractTimeSeriesRows(stockId, qtrCF, 'cash_flow', 'quarterly'));

    // Store statements
    if (allRows.length > 0) {
      await upsertFinancialStatements(stockId, allRows);
    }

    if (!profileOk && !summaryOk && allRows.length === 0) {
      return { success: false, error: 'No data from any source', profileOk, stmtCount: 0, summaryOk };
    }

    return { success: true, profileOk, stmtCount: allRows.length, summaryOk };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg.slice(0, 200), profileOk: false, stmtCount: 0, summaryOk: false };
  }
}

// ─── Batch Processor ─────────────────────────────────────────────────────────

async function processAllTickers(
  allStocks: Array<{ id: string; ticker: string; exchange: string }>,
  progress: ProgressData,
): Promise<void> {
  const completedSet = new Set(progress.completed);
  const remaining = allStocks.filter((s) => !completedSet.has(s.ticker));

  log(`Total: ${allStocks.length} | Already completed: ${completedSet.size} | Remaining: ${remaining.length}`);

  let processed = 0;

  // Process sequentially in batches of YAHOO_CONCURRENCY
  for (let i = 0; i < remaining.length; i += YAHOO_CONCURRENCY) {
    const batch = remaining.slice(i, i + YAHOO_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((s) => processTicker(s.ticker, s.exchange, s.id))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const stock = batch[j];
      processed++;

      if (result.status === 'fulfilled' && result.value.success) {
        progress.completed.push(stock.ticker);
        progress.stats.completed++;
        progress.stats.remaining--;
        if (result.value.profileOk) progress.stats.profiles++;
        progress.stats.statements += result.value.stmtCount;
        if (result.value.summaryOk) progress.stats.summaries++;
      } else {
        const error = result.status === 'rejected'
          ? String(result.reason?.message ?? result.reason).slice(0, 200)
          : (result.value?.error ?? 'Unknown error');
        progress.failed[stock.ticker] = error;
        progress.stats.failed++;
        progress.stats.remaining--;
      }
    }

    saveProgress(progress);

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = remaining.length > processed
      ? Math.round((remaining.length - processed) / rate)
      : 0;
    const etaMin = Math.floor(eta / 60);
    const etaSec = eta % 60;
    log(`  ${progress.stats.completed}/${allStocks.length} done | Profiles: ${progress.stats.profiles} | Stmts: ${progress.stats.statements} | Summaries: ${progress.stats.summaries} | Rate: ${rate.toFixed(2)}/s | ETA: ${etaMin}m${etaSec}s`);

    if (i + YAHOO_CONCURRENCY < remaining.length) {
      await sleep(YAHOO_DELAY_MS);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!db) {
    console.error('Database not available. Set DATABASE_URL in .env.production');
    process.exit(1);
  }

  log('═'.repeat(60));
  log('  VETTR Financial Statements Ingestion — Phase 6');
  log(`  Started at: ${new Date().toISOString()}`);
  log(`  Yahoo concurrency: ${YAHOO_CONCURRENCY} | Batch delay: ${YAHOO_DELAY_MS}ms`);
  log(`  FTS inter-call delay: ${FTS_DELAY_MS}ms`);
  log(`  Retry backoffs: ${RETRY_DELAYS.join('/')}`);
  log(`  Using fundamentalsTimeSeries API (not deprecated quoteSummary stmts)`);
  log('═'.repeat(60));

  const allStocks = await db
    .select({ id: stocks.id, ticker: stocks.ticker, exchange: stocks.exchange })
    .from(stocks)
    .orderBy(stocks.ticker);

  log(`Found ${allStocks.length} stocks in database`);

  const progress = loadProgress();
  progress.totalTickers = allStocks.length;
  progress.stats.remaining = allStocks.length - progress.stats.completed;

  startTime = Date.now();

  await processAllTickers(allStocks, progress);

  saveProgress(progress);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  log('');
  log('═'.repeat(60));
  log('  FINAL SUMMARY');
  log(`  Total tickers: ${allStocks.length}`);
  log(`  Completed: ${progress.stats.completed}`);
  log(`  Failed: ${progress.stats.failed}`);
  log(`  Profiles: ${progress.stats.profiles}`);
  log(`  Statement rows: ${progress.stats.statements}`);
  log(`  Summaries: ${progress.stats.summaries}`);
  log(`  Duration: ${elapsedMin}m ${elapsedSec}s`);
  log('═'.repeat(60));

  const failedEntries = Object.entries(progress.failed);
  if (failedEntries.length > 0) {
    log(`\n  Top failures (${Math.min(20, failedEntries.length)} of ${failedEntries.length}):`);
    for (const [t, err] of failedEntries.slice(0, 20)) {
      log(`    ${t}: ${err}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    log(`FATAL: ${error}`);
    console.error(error);
    process.exit(1);
  });
