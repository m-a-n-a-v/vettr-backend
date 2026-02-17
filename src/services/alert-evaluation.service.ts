import { eq, and, desc, gt, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { alertRules, alerts, stocks, vetrScoreHistory, filings } from '../db/schema/index.js';

interface EvaluationResult {
  triggeredCount: number;
  evaluatedRules: number;
}

/**
 * Evaluate all active alert rules and create triggered alerts when conditions match.
 * Implements 24hr dedup: skips rules where lastTriggeredAt is within the last 24 hours.
 */
export async function evaluateAlerts(): Promise<EvaluationResult> {
  if (!db) {
    throw new Error('Database not available');
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch all active alert rules
  const activeRules = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.isActive, true));

  let triggeredCount = 0;
  let evaluatedRules = 0;

  for (const rule of activeRules) {
    // 24hr dedup: skip rules triggered within the last 24 hours
    if (rule.lastTriggeredAt && rule.lastTriggeredAt > twentyFourHoursAgo) {
      continue;
    }

    evaluatedRules++;

    // Find the stock by ticker
    const [stock] = await db
      .select()
      .from(stocks)
      .where(eq(stocks.ticker, rule.stockTicker))
      .limit(1);

    if (!stock) {
      continue; // Stock not found, skip this rule
    }

    const result = await evaluateRule(rule, stock);

    if (result.triggered) {
      // Create the triggered alert
      await db.insert(alerts).values({
        userId: rule.userId,
        stockId: stock.id,
        alertRuleId: rule.id,
        alertType: rule.ruleType,
        title: result.title,
        message: result.message,
        triggeredAt: new Date(),
        isRead: false,
      });

      // Update lastTriggeredAt on the rule
      await db
        .update(alertRules)
        .set({ lastTriggeredAt: new Date() })
        .where(eq(alertRules.id, rule.id));

      triggeredCount++;
    }
  }

  return { triggeredCount, evaluatedRules };
}

interface RuleEvaluationResult {
  triggered: boolean;
  title: string;
  message: string;
}

/**
 * Evaluate a single alert rule against stock data.
 */
async function evaluateRule(
  rule: typeof alertRules.$inferSelect,
  stock: typeof stocks.$inferSelect,
): Promise<RuleEvaluationResult> {
  const ruleType = rule.ruleType.toLowerCase();

  switch (ruleType) {
    case 'red_flag':
    case 'red flag':
      return evaluateRedFlag(rule, stock);

    case 'financing':
      return evaluateFilingType(rule, stock, ['financing', 'prospectus'], 'Financing Activity');

    case 'executive_changes':
    case 'executive changes':
      return evaluateFilingType(rule, stock, ['management', 'executive'], 'Executive Changes');

    case 'consolidation':
      return evaluateFilingType(rule, stock, ['consolidation'], 'Consolidation Activity');

    case 'drill_results':
    case 'drill results':
      return evaluateFilingType(rule, stock, ['drill', 'results'], 'Drill Results');

    default:
      return { triggered: false, title: '', message: '' };
  }
}

/**
 * Red Flag rule: triggers when overallScore < threshold (default 50).
 */
async function evaluateRedFlag(
  rule: typeof alertRules.$inferSelect,
  stock: typeof stocks.$inferSelect,
): Promise<RuleEvaluationResult> {
  if (!db) throw new Error('Database not available');

  const threshold = rule.threshold ?? 50;

  // Get latest vetrScoreHistory for this stock
  const [latestScore] = await db
    .select()
    .from(vetrScoreHistory)
    .where(eq(vetrScoreHistory.stockTicker, stock.ticker))
    .orderBy(desc(vetrScoreHistory.calculatedAt))
    .limit(1);

  if (!latestScore) {
    return { triggered: false, title: '', message: '' };
  }

  if (latestScore.overallScore < threshold) {
    return {
      triggered: true,
      title: `Red Flag: ${stock.ticker} score below ${threshold}`,
      message: `${stock.name} (${stock.ticker}) VETR score dropped to ${latestScore.overallScore}, below your threshold of ${threshold}. Review the stock\'s fundamentals for potential concerns.`,
    };
  }

  return { triggered: false, title: '', message: '' };
}

/**
 * Filing-based rules: triggers when a matching filing type is found in the last 30 days.
 */
async function evaluateFilingType(
  rule: typeof alertRules.$inferSelect,
  stock: typeof stocks.$inferSelect,
  typeKeywords: string[],
  label: string,
): Promise<RuleEvaluationResult> {
  if (!db) throw new Error('Database not available');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Build OR conditions for type matching using ilike
  const typeConditions = typeKeywords.map(
    (keyword) => sql`lower(${filings.type}) like ${`%${keyword.toLowerCase()}%`}`,
  );

  const orCondition = sql`(${sql.join(typeConditions, sql` OR `)})`;

  const recentFilings = await db
    .select()
    .from(filings)
    .where(
      and(
        eq(filings.stockId, stock.id),
        gt(filings.date, thirtyDaysAgo),
        orCondition,
      ),
    )
    .orderBy(desc(filings.date))
    .limit(5);

  if (recentFilings.length > 0) {
    const latestFiling = recentFilings[0];
    return {
      triggered: true,
      title: `${label}: ${stock.ticker} - New filing detected`,
      message: `${stock.name} (${stock.ticker}) has ${recentFilings.length} recent ${label.toLowerCase()} filing(s) in the last 30 days. Latest: "${latestFiling.title}" filed on ${latestFiling.date.toISOString().split('T')[0]}.`,
    };
  }

  return { triggered: false, title: '', message: '' };
}
