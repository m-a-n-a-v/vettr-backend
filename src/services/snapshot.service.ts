import { eq, and, gte, desc, sql, lt } from 'drizzle-orm';
import { db } from '../config/database.js';
import { vetrScoreSnapshots } from '../db/schema/index.js';
import { InternalError } from '../utils/errors.js';

/**
 * Snapshot service for VETR Score time-series data
 * Manages hourly snapshots optimized for charting and trend analysis
 */

interface SnapshotScores {
  overall: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}

interface SnapshotData {
  ticker: string;
  scores: SnapshotScores;
  price: number | null;
}

interface SnapshotRow {
  overall_score: number;
  financial_survival_score: number;
  operational_efficiency_score: number;
  shareholder_structure_score: number;
  market_sentiment_score: number;
  price: number | null;
  recorded_at: string;
}

/**
 * Upsert a single snapshot for a ticker
 * Truncates recorded_at to the current hour to ensure exactly one row per ticker per hour
 */
export async function upsertSnapshot(
  ticker: string,
  scores: SnapshotScores,
  price: number | null
): Promise<void> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  await db
    .insert(vetrScoreSnapshots)
    .values({
      stockTicker: ticker.toUpperCase(),
      overallScore: scores.overall,
      financialSurvivalScore: scores.p1,
      operationalEfficiencyScore: scores.p2,
      shareholderStructureScore: scores.p3,
      marketSentimentScore: scores.p4,
      price: price,
      recordedAt: sql`date_trunc('hour', now())`,
    })
    .onConflictDoUpdate({
      target: [vetrScoreSnapshots.stockTicker, vetrScoreSnapshots.recordedAt],
      set: {
        overallScore: scores.overall,
        financialSurvivalScore: scores.p1,
        operationalEfficiencyScore: scores.p2,
        shareholderStructureScore: scores.p3,
        marketSentimentScore: scores.p4,
        price: price,
      },
    });
}

/**
 * Upsert multiple snapshots in batch with concurrency control
 * Uses Promise.allSettled to handle partial failures gracefully
 */
export async function upsertSnapshotsBatch(
  snapshots: SnapshotData[]
): Promise<{ succeeded: number; failed: number }> {
  const CONCURRENCY = 20;
  const results: PromiseSettledResult<void>[] = [];

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < snapshots.length; i += CONCURRENCY) {
    const chunk = snapshots.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.allSettled(
      chunk.map((snapshot) =>
        upsertSnapshot(snapshot.ticker, snapshot.scores, snapshot.price)
      )
    );
    results.push(...chunkResults);
  }

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return { succeeded, failed };
}

/**
 * Get snapshots for a ticker within a time range
 * Returns hourly data points ordered chronologically
 */
export async function getSnapshotsForTicker(
  ticker: string,
  range: '24h' | '7d' | '30d' | '90d'
): Promise<SnapshotRow[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const rangeHours: Record<typeof range, number> = {
    '24h': 24,
    '7d': 168,
    '30d': 720,
    '90d': 2160,
  };

  const hoursAgo = rangeHours[range];
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

  const results = await db
    .select({
      overall_score: vetrScoreSnapshots.overallScore,
      financial_survival_score: vetrScoreSnapshots.financialSurvivalScore,
      operational_efficiency_score: vetrScoreSnapshots.operationalEfficiencyScore,
      shareholder_structure_score: vetrScoreSnapshots.shareholderStructureScore,
      market_sentiment_score: vetrScoreSnapshots.marketSentimentScore,
      price: vetrScoreSnapshots.price,
      recorded_at: vetrScoreSnapshots.recordedAt,
    })
    .from(vetrScoreSnapshots)
    .where(
      and(
        eq(vetrScoreSnapshots.stockTicker, ticker.toUpperCase()),
        gte(vetrScoreSnapshots.recordedAt, cutoff)
      )
    )
    .orderBy(vetrScoreSnapshots.recordedAt);

  return results.map((row) => ({
    ...row,
    recorded_at: row.recorded_at.toISOString(),
  }));
}

/**
 * Get total count of snapshots (for monitoring)
 */
export async function getSnapshotCount(): Promise<number> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(vetrScoreSnapshots);

  return result[0]?.count ?? 0;
}

/**
 * Delete snapshots older than retention period
 * Returns count of deleted rows
 */
export async function cleanupOldSnapshots(retentionDays: number = 90): Promise<number> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const cutoffDate = new Date(Date.now() - retentionDays * 86400000);

  const result = await db
    .delete(vetrScoreSnapshots)
    .where(lt(vetrScoreSnapshots.recordedAt, cutoffDate));

  return result.rowCount ?? 0;
}
