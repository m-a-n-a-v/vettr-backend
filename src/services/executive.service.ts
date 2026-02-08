import { eq, ilike, or, sql, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { executives } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

export interface ExecutiveScore {
  team_size_score: number;
  avg_tenure_score: number;
  specialization_diversity_score: number;
  total: number;
}

export async function getExecutivesForStock(stockId: string): Promise<(typeof executives.$inferSelect)[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const results = await db
    .select()
    .from(executives)
    .where(eq(executives.stockId, stockId))
    .orderBy(desc(executives.yearsAtCompany));

  return results;
}

export async function searchByName(query: string, limit: number = 10): Promise<(typeof executives.$inferSelect)[]> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const results = await db
    .select()
    .from(executives)
    .where(
      or(
        ilike(executives.name, `%${query}%`),
        ilike(executives.title, `%${query}%`)
      )
    )
    .orderBy(executives.name)
    .limit(limit);

  return results;
}

export async function getExecutiveById(id: string): Promise<typeof executives.$inferSelect> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const results = await db
    .select()
    .from(executives)
    .where(eq(executives.id, id))
    .limit(1);

  const executive = results[0];
  if (!executive) {
    throw new NotFoundError(`Executive with id '${id}' not found`);
  }

  return executive;
}

/**
 * Calculate executive team score for a stock.
 * Components:
 * - Team size: max 30pts (5+ executives = 30pts, 4 = 24pts, 3 = 18pts, 2 = 12pts, 1 = 6pts, 0 = 0pts)
 * - Avg tenure: max 40pts (10+ years avg = 40pts, scaled linearly)
 * - Specialization diversity: max 30pts (5+ unique specializations = 30pts, scaled linearly)
 * Total: 0-100
 */
export async function getExecutiveScore(stockId: string): Promise<ExecutiveScore> {
  if (!db) {
    throw new InternalError('Database not available');
  }

  const execs = await db
    .select()
    .from(executives)
    .where(eq(executives.stockId, stockId));

  const teamSize = execs.length;

  // Team size score: max 30pts at 5+ executives
  const teamSizeScore = Math.min(teamSize * 6, 30);

  // Avg tenure score: max 40pts at 10+ years average
  let avgTenureScore = 0;
  if (teamSize > 0) {
    const avgTenure = execs.reduce((sum, e) => sum + e.yearsAtCompany, 0) / teamSize;
    avgTenureScore = Math.min(Math.round((avgTenure / 10) * 40), 40);
  }

  // Specialization diversity score: max 30pts at 5+ unique specializations
  const uniqueSpecializations = new Set(
    execs
      .map((e) => e.specialization)
      .filter((s): s is string => s !== null && s !== undefined && s.length > 0)
  );
  const specCount = uniqueSpecializations.size;
  const specDiversityScore = Math.min(specCount * 6, 30);

  const total = teamSizeScore + avgTenureScore + specDiversityScore;

  return {
    team_size_score: teamSizeScore,
    avg_tenure_score: avgTenureScore,
    specialization_diversity_score: specDiversityScore,
    total,
  };
}
