/**
 * Phase 4: Recalculate VETR scores for all stocks in the database.
 *
 * Queries all stocks, then calls calculateVetrScore(ticker) for each.
 * Processes in batches to avoid overwhelming the DB connection pool.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/ingest/04_recalculate_scores.ts
 */

import { db } from '../../src/config/database.js';
import { stocks } from '../../src/db/schema/index.js';
import { calculateVetrScore } from '../../src/services/vetr-score.service.js';

const BATCH_SIZE = 20;

async function recalculateScores() {
  if (!db) {
    console.error('❌ Database not available. Set DATABASE_URL env var.');
    process.exit(1);
  }

  console.log('🧮 VETTR Score Recalculation — Phase 4\n');

  // Get all stocks
  const allStocks = await db
    .select({ ticker: stocks.ticker, name: stocks.name })
    .from(stocks);

  console.log(`📋 Total stocks: ${allStocks.length}\n`);

  let calculated = 0;
  let failed = 0;
  const scores: Array<{ ticker: string; score: number }> = [];

  // Process in batches
  for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
    const batch = allStocks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allStocks.length / BATCH_SIZE);

    console.log(`--- Batch ${batchNum}/${totalBatches} ---`);

    // Process each ticker in the batch sequentially
    // (calculateVetrScore already updates stocks.vetr_score and saves to history)
    for (const stock of batch) {
      try {
        const result = await calculateVetrScore(stock.ticker);
        scores.push({ ticker: stock.ticker, score: result.overall_score });
        calculated++;

        // Show progress
        if (calculated % 20 === 0) {
          console.log(`   ✅ ${calculated}/${allStocks.length} calculated...`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ ${stock.ticker}: ${msg}`);
        failed++;
      }
    }
  }

  // Sort by score descending for summary
  scores.sort((a, b) => b.score - a.score);

  // Stats
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0;
  const highScore = scores.length > 0 ? scores[0] : null;
  const lowScore = scores.length > 0 ? scores[scores.length - 1] : null;

  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 Score Recalculation Summary:');
  console.log(`   Stocks calculated:  ${calculated}`);
  console.log(`   Failed:             ${failed}`);
  console.log(`   Average score:      ${avgScore}`);
  if (highScore) console.log(`   Highest:            ${highScore.ticker} → ${highScore.score}`);
  if (lowScore) console.log(`   Lowest:             ${lowScore.ticker} → ${lowScore.score}`);

  // Score distribution
  const ranges = [
    { label: '90-100 (Dark Green)', min: 90, max: 100 },
    { label: '75-89  (Green)',      min: 75, max: 89 },
    { label: '50-74  (Yellow)',     min: 50, max: 74 },
    { label: '30-49  (Orange)',     min: 30, max: 49 },
    { label: '0-29   (Red)',        min: 0,  max: 29 },
  ];

  console.log('\n   Score Distribution:');
  for (const range of ranges) {
    const count = scores.filter((s) => s.score >= range.min && s.score <= range.max).length;
    const bar = '█'.repeat(Math.ceil(count / Math.max(1, Math.ceil(scores.length / 40))));
    console.log(`     ${range.label}: ${count} ${bar}`);
  }

  console.log('\n✅ Phase 4 complete!');
}

// Run
recalculateScores()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
