/**
 * Quick test: run the fundamentals fetch for just 3 tickers.
 * Usage: node --env-file=.env.production node_modules/.bin/tsx scripts/ingest/05_test_3_tickers.ts
 */

import { db } from '../../src/config/database.js';
import { stocks } from '../../src/db/schema/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  if (!db) {
    console.error('No DB connection');
    process.exit(1);
  }

  // Check we can reach the DB
  const allStocks = await db
    .select({ id: stocks.id, ticker: stocks.ticker, exchange: stocks.exchange })
    .from(stocks)
    .limit(3);

  console.log(`Found ${allStocks.length} test tickers:`);
  for (const s of allStocks) {
    console.log(`  ${s.ticker} (${s.exchange}) — ${s.id}`);
  }

  // Check the 13 new tables exist
  const tables = [
    'valuation_metrics', 'earnings_history', 'earnings_estimates',
    'analyst_consensus', 'analyst_actions', 'short_interest',
    'institutional_holders', 'major_holders_breakdown',
    'insider_holdings', 'insider_transactions',
    'dividend_info', 'corporate_events', 'stock_news',
  ];

  for (const t of tables) {
    try {
      const res = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM ${t}`));
      console.log(`  ✓ ${t} exists (${(res as any).rows?.[0]?.cnt ?? '?'} rows)`);
    } catch (e: any) {
      console.log(`  ✗ ${t} MISSING: ${e.message?.slice(0, 80)}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
