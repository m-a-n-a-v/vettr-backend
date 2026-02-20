import { asc, eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { stocks, cronJobRuns } from '../db/schema/index.js';
import { calculateVetrScore } from './vetr-score.service.js';
import { detectRedFlags } from './red-flag.service.js';
import { InternalError } from '../utils/errors.js';
import * as cache from './cache.service.js';

// --- Types ---

export interface CronJobResult {
  job: string;
  stocks_processed: number;
  succeeded: number;
  failed: number;
  failures: Array<{ ticker: string; error: string }>;
  duration_ms: number;
  completed_at: string;
  chunk_info: {
    current_offset: number;
    chunk_size: number;
    total_stocks: number;
    is_complete: boolean;
  };
}

// --- Constants ---

const REDIS_CURSOR_TTL = 86400; // 24 hours
const SCORES_CURSOR_KEY = 'cron:scores:offset';
const RED_FLAGS_CURSOR_KEY = 'cron:red-flags:offset';
const BATCH_CONCURRENCY = 10; // Process 10 tickers in parallel at a time

// --- Helper Functions ---

/**
 * Process a batch of tickers with controlled concurrency.
 * Processes items in batches of BATCH_CONCURRENCY using Promise.allSettled.
 */
async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  batchSize: number = BATCH_CONCURRENCY
): Promise<{ succeeded: number; failed: number; failures: Array<{ ticker: string; error: string }> }> {
  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ ticker: string; error: string }> = [];

  // Process in batches of batchSize
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((item) => processor(item))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded++;
      } else {
        failed++;
        const ticker = typeof batch[index] === 'string' ? batch[index] : 'unknown';
        failures.push({
          ticker: ticker as string,
          error: result.reason?.message || String(result.reason),
        });
      }
    });
  }

  return { succeeded, failed, failures };
}

// --- Main Cron Functions ---

/**
 * Refresh VETR scores for a chunk of stocks.
 * Uses Redis cursor to track progress across multiple invocations.
 */
export async function refreshScoresChunk(chunkSize: number = 1000): Promise<CronJobResult> {
  const startTime = Date.now();
  const jobName = 'refresh-scores';

  // Get current offset from Redis (default to 0)
  const currentOffset = (await cache.get<number>(SCORES_CURSOR_KEY)) || 0;

  // Query all stock tickers ordered by ticker ASC
  if (!db) {
    throw new InternalError('Database not available');
  }

  const allStocks = await db
    .select({ ticker: stocks.ticker })
    .from(stocks)
    .orderBy(asc(stocks.ticker));

  const totalStocks = allStocks.length;

  // Take a slice from currentOffset to currentOffset + chunkSize
  const chunk = allStocks.slice(currentOffset, currentOffset + chunkSize);
  const tickers = chunk.map((s) => s.ticker);

  // Create job history record with 'running' status
  const [jobRecord] = await db
    .insert(cronJobRuns)
    .values({
      jobName,
      status: 'running',
      chunkOffset: currentOffset,
      chunkSize,
      totalStocks,
    })
    .returning();

  console.log(
    `Cron ${jobName}: processing tickers ${currentOffset}-${currentOffset + chunk.length} of ${totalStocks}`
  );

  try {
    // Process the chunk with controlled concurrency
    // Bust the Redis cache before each calculation to ensure fresh data
    const { succeeded, failed, failures } = await processBatch(
      tickers,
      async (ticker) => {
        console.log(`  [${jobName}] Processing ${ticker}...`);
        // Invalidate cached score so calculateVetrScore recomputes from DB
        await cache.del(`vetr_score:${ticker.toUpperCase()}`);
        await calculateVetrScore(ticker);
        console.log(`  [${jobName}] ✓ ${ticker}`);
      }
    );

    // Calculate next offset
    const nextOffset = currentOffset + chunk.length;
    const isComplete = nextOffset >= totalStocks;

    // Update Redis cursor (or reset to 0 if complete)
    if (isComplete) {
      await cache.set(SCORES_CURSOR_KEY, 0, REDIS_CURSOR_TTL);
      console.log(`Cron ${jobName}: cycle complete, cursor reset to 0`);
    } else {
      await cache.set(SCORES_CURSOR_KEY, nextOffset, REDIS_CURSOR_TTL);
      console.log(`Cron ${jobName}: cursor updated to ${nextOffset}`);
    }

    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    console.log(
      `Cron ${jobName}: completed in ${durationMs}ms - ${succeeded} succeeded, ${failed} failed`
    );

    // Update job history record to 'completed'
    await db
      .update(cronJobRuns)
      .set({
        status: 'completed',
        stocksProcessed: chunk.length,
        succeeded,
        failedCount: failed,
        failures: failures.length > 0 ? failures : null,
        durationMs,
        completedAt: new Date(),
      })
      .where(eq(cronJobRuns.id, jobRecord.id));

    return {
      job: jobName,
      stocks_processed: chunk.length,
      succeeded,
      failed,
      failures,
      duration_ms: durationMs,
      completed_at: completedAt,
      chunk_info: {
        current_offset: currentOffset,
        chunk_size: chunkSize,
        total_stocks: totalStocks,
        is_complete: isComplete,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update job history record to 'failed'
    await db
      .update(cronJobRuns)
      .set({
        status: 'failed',
        durationMs,
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(cronJobRuns.id, jobRecord.id));

    throw error;
  }
}

/**
 * Refresh red flags for a chunk of stocks.
 * Uses Redis cursor to track progress across multiple invocations.
 */
export async function refreshRedFlagsChunk(chunkSize: number = 1000): Promise<CronJobResult> {
  const startTime = Date.now();
  const jobName = 'refresh-red-flags';

  // Get current offset from Redis (default to 0)
  const currentOffset = (await cache.get<number>(RED_FLAGS_CURSOR_KEY)) || 0;

  // Query all stock tickers ordered by ticker ASC
  if (!db) {
    throw new InternalError('Database not available');
  }

  const allStocks = await db
    .select({ ticker: stocks.ticker })
    .from(stocks)
    .orderBy(asc(stocks.ticker));

  const totalStocks = allStocks.length;

  // Take a slice from currentOffset to currentOffset + chunkSize
  const chunk = allStocks.slice(currentOffset, currentOffset + chunkSize);
  const tickers = chunk.map((s) => s.ticker);

  // Create job history record with 'running' status
  const [jobRecord] = await db
    .insert(cronJobRuns)
    .values({
      jobName,
      status: 'running',
      chunkOffset: currentOffset,
      chunkSize,
      totalStocks,
    })
    .returning();

  console.log(
    `Cron ${jobName}: processing tickers ${currentOffset}-${currentOffset + chunk.length} of ${totalStocks}`
  );

  try {
    // Process the chunk with controlled concurrency
    // Bust the Redis cache before each detection to ensure fresh data
    const { succeeded, failed, failures } = await processBatch(
      tickers,
      async (ticker) => {
        console.log(`  [${jobName}] Processing ${ticker}...`);
        // Invalidate cached red flags so detectRedFlags recomputes from DB
        await cache.del(`red_flags:${ticker.toUpperCase()}`);
        await detectRedFlags(ticker);
        console.log(`  [${jobName}] ✓ ${ticker}`);
      }
    );

    // Calculate next offset
    const nextOffset = currentOffset + chunk.length;
    const isComplete = nextOffset >= totalStocks;

    // Update Redis cursor (or reset to 0 if complete)
    if (isComplete) {
      await cache.set(RED_FLAGS_CURSOR_KEY, 0, REDIS_CURSOR_TTL);
      console.log(`Cron ${jobName}: cycle complete, cursor reset to 0`);
    } else {
      await cache.set(RED_FLAGS_CURSOR_KEY, nextOffset, REDIS_CURSOR_TTL);
      console.log(`Cron ${jobName}: cursor updated to ${nextOffset}`);
    }

    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    console.log(
      `Cron ${jobName}: completed in ${durationMs}ms - ${succeeded} succeeded, ${failed} failed`
    );

    // Update job history record to 'completed'
    await db
      .update(cronJobRuns)
      .set({
        status: 'completed',
        stocksProcessed: chunk.length,
        succeeded,
        failedCount: failed,
        failures: failures.length > 0 ? failures : null,
        durationMs,
        completedAt: new Date(),
      })
      .where(eq(cronJobRuns.id, jobRecord.id));

    return {
      job: jobName,
      stocks_processed: chunk.length,
      succeeded,
      failed,
      failures,
      duration_ms: durationMs,
      completed_at: completedAt,
      chunk_info: {
        current_offset: currentOffset,
        chunk_size: chunkSize,
        total_stocks: totalStocks,
        is_complete: isComplete,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update job history record to 'failed'
    await db
      .update(cronJobRuns)
      .set({
        status: 'failed',
        durationMs,
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(cronJobRuns.id, jobRecord.id));

    throw error;
  }
}

/**
 * Refresh both scores and red flags in sequence.
 * This is the main function called by the Vercel cron.
 */
export async function refreshAllChunked(
  chunkSize: number = 1000
): Promise<{
  scores: CronJobResult;
  red_flags: CronJobResult;
  total_duration_ms: number;
}> {
  const startTime = Date.now();

  console.log('Cron refresh-all: starting...');

  // Run scores first, then red flags
  const scores = await refreshScoresChunk(chunkSize);
  const redFlags = await refreshRedFlagsChunk(chunkSize);

  const totalDurationMs = Date.now() - startTime;

  console.log(`Cron refresh-all: completed in ${totalDurationMs}ms`);

  return {
    scores,
    red_flags: redFlags,
    total_duration_ms: totalDurationMs,
  };
}
