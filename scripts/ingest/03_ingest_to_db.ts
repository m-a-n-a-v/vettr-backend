/**
 * Phase 3: Ingest yfinance JSON data into Neon DB.
 *
 * Reads per-ticker JSON files from data/stock_data/
 * Upserts into stocks, financial_data, and executives tables.
 *
 * Pilot stocks (25 original) keep their rich executive/filing data.
 * New stocks get sparse executive records from yfinance officers.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/ingest/03_ingest_to_db.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { db } from '../../src/config/database.js';
import { stocks, financialData, executives } from '../../src/db/schema/index.js';
import { mapToStockUpsert, mapToFinancialDataUpsert, mapToExecutiveInserts, isPilotStock } from './field_mapper.js';
import type { YFinanceTickerData } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STOCK_DATA_DIR = join(__dirname, 'data', 'stock_data');
const BATCH_SIZE = 50;

async function ingestToDb() {
  if (!db) {
    console.error('❌ Database not available. Set DATABASE_URL env var.');
    process.exit(1);
  }

  console.log('🗄️  VETTR Data Ingestion — Phase 3: DB Upsert\n');

  // Check data directory
  if (!existsSync(STOCK_DATA_DIR)) {
    console.error(`❌ Stock data directory not found: ${STOCK_DATA_DIR}`);
    console.error('   Run 02_fetch_yfinance_data.py first.');
    process.exit(1);
  }

  // Read all JSON files
  const files = readdirSync(STOCK_DATA_DIR).filter((f) => f.endsWith('.json'));
  console.log(`📁 Found ${files.length} ticker JSON files\n`);

  if (files.length === 0) {
    console.log('⚠️  No data files to process.');
    return;
  }

  let stocksUpserted = 0;
  let financialUpserted = 0;
  let executivesInserted = 0;
  let errors = 0;
  let skipped = 0;

  // Process in batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);

    console.log(`--- Batch ${batchNum}/${totalBatches} (${batch.length} tickers) ---`);

    for (const file of batch) {
      try {
        const raw = readFileSync(join(STOCK_DATA_DIR, file), 'utf-8');
        const data: YFinanceTickerData = JSON.parse(raw);
        const ticker = data.vettr_ticker.toUpperCase();

        // 1. Upsert stock
        const stockData = mapToStockUpsert(data);
        await db
          .insert(stocks)
          .values(stockData)
          .onConflictDoUpdate({
            target: stocks.ticker,
            set: {
              name: stockData.name,
              exchange: stockData.exchange,
              sector: stockData.sector,
              marketCap: stockData.marketCap,
              price: stockData.price,
              priceChange: stockData.priceChange,
              // Don't overwrite vetrScore — will be recalculated in Phase 4
            },
          });
        stocksUpserted++;

        // 2. Get stock ID for foreign key references
        const stockRows = await db
          .select({ id: stocks.id })
          .from(stocks)
          .where(eq(stocks.ticker, ticker))
          .limit(1);

        if (stockRows.length === 0) {
          console.error(`   ⚠️  ${ticker}: Stock not found after upsert`);
          errors++;
          continue;
        }

        const stockId = stockRows[0].id;

        // 3. Upsert financial data
        const finData = mapToFinancialDataUpsert(data, stockId);
        await db
          .insert(financialData)
          .values(finData)
          .onConflictDoUpdate({
            target: financialData.stockId,
            set: {
              cash: finData.cash,
              monthlyBurn: finData.monthlyBurn,
              totalDebt: finData.totalDebt,
              totalAssets: finData.totalAssets,
              explorationExp: finData.explorationExp,
              rAndDExp: finData.rAndDExp,
              totalOpex: finData.totalOpex,
              gAndAExpense: finData.gAndAExpense,
              revenue: finData.revenue,
              sharesCurrent: finData.sharesCurrent,
              shares1YrAgo: finData.shares1YrAgo,
              insiderShares: finData.insiderShares,
              totalShares: finData.totalShares,
              avgVol30d: finData.avgVol30d,
              daysSinceLastPr: finData.daysSinceLastPr,
              updatedAt: new Date(),
            },
          });
        financialUpserted++;

        // 4. Handle executives
        if (isPilotStock(ticker)) {
          // Pilot stock — preserve existing rich executive data
          skipped++;
        } else {
          // New stock — delete existing sparse execs and insert fresh from yfinance
          const execInserts = mapToExecutiveInserts(data, stockId);
          if (execInserts.length > 0) {
            // Delete existing executives for this stock
            await db.delete(executives).where(eq(executives.stockId, stockId));

            // Insert new sparse executives
            for (const exec of execInserts) {
              await db.insert(executives).values(exec);
              executivesInserted++;
            }
          }
        }

        if (stocksUpserted % 50 === 0) {
          console.log(`   ✅ Processed ${stocksUpserted}/${files.length} stocks...`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ ${file}: ${msg}`);
        errors++;
      }
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 Ingestion Summary:');
  console.log(`   Stocks upserted:      ${stocksUpserted}`);
  console.log(`   Financial data:       ${financialUpserted}`);
  console.log(`   Executives inserted:  ${executivesInserted}`);
  console.log(`   Pilot stocks (execs preserved): ${skipped}`);
  console.log(`   Errors:               ${errors}`);
  console.log('\n✅ Phase 3 complete!');
}

// Run
ingestToDb()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
