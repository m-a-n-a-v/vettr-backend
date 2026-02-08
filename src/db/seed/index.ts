import { db } from '../../config/database.js';
import { filings, executives } from '../schema/index.js';
import { seedStocks } from './stocks.js';
import { seedFilings } from './filings.js';
import { seedExecutives } from './executives.js';

/**
 * Run all seed functions in order.
 * Stocks must be seeded first (filings and executives depend on stock IDs).
 * Filings and executives are cleared before re-seeding to avoid duplicates
 * (they don't have unique constraints to upsert on).
 * Stocks use upsert (onConflictDoUpdate) so they're safe to re-run.
 */
export async function runAllSeeds(): Promise<void> {
  if (!db) {
    console.error('❌ Database not available - cannot run seeds');
    console.error('   Set DATABASE_URL in your .env file to connect to a database');
    process.exit(1);
  }

  console.log('🌱 Starting database seed...\n');

  const startTime = Date.now();

  // 1. Seed stocks first (uses upsert, safe to re-run)
  const stockCount = await seedStocks();

  // 2. Clear existing filings before re-seeding (no unique constraint to upsert on)
  console.log('🗑️  Clearing existing filings...');
  await db.delete(filings);

  const filingCount = await seedFilings();

  // 3. Clear existing executives before re-seeding (no unique constraint to upsert on)
  console.log('🗑️  Clearing existing executives...');
  await db.delete(executives);

  const executiveCount = await seedExecutives();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n📊 Seed Summary:');
  console.log(`   Stocks:     ${stockCount}`);
  console.log(`   Filings:    ${filingCount}`);
  console.log(`   Executives: ${executiveCount}`);
  console.log(`   Duration:   ${duration}s`);
  console.log('\n✅ Database seed complete!');
}
