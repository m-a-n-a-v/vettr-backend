import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { success } from '../utils/response.js';
import { NotFoundError, ValidationError, TierLimitError, InternalError } from '../utils/errors.js';
import { db } from '../config/database.js';
import { aiAgentUsage } from '../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  getInitialQuestions,
  getFollowUpQuestions,
  getQuestionById,
} from '../services/ai-agent-questions.js';
import {
  respondFinancialHealth,
  respondDebtAnalysis,
  respondCashPosition,
  respondAnalystView,
  respondRecentActions,
  respondPriceTargets,
  respondInsiderActivity,
  respondTopHolders,
  respondSmartMoney,
  respondValuation,
  respondPeerValuation,
  respondDividendCheck,
  respondEarnings,
  respondEarningsBeats,
  respondEarningsOutlook,
  respondRedFlags,
  respondCriticalFlags,
  respondFlagTrend,
} from '../services/ai-agent-responders.js';
import type { AuthUser } from '../middleware/auth.js';
import type { AiAgentResponseData } from '../services/ai-agent-responders.js';

type Variables = {
  requestId: string;
  user: AuthUser;
};

const aiAgentRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes
aiAgentRoutes.use('*', authMiddleware);

// ─── Tier Limits ─────────────────────────────────────────────────────────────
const TIER_LIMITS: Record<string, number> = {
  free: 3,
  pro: 15,
  premium: Infinity,
};

/**
 * Get usage stats for a user on the current date
 */
async function getUsageStats(userId: string, tier: string) {
  if (!db) throw new InternalError('Database not available');

  const limit = TIER_LIMITS[tier.toLowerCase()] ?? 3;

  // For premium tier, skip counting (unlimited)
  if (limit === Infinity) {
    const resetDate = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate() + 1,
        0,
        0,
        0
      )
    );
    return {
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      resets_at: resetDate.toISOString(),
    };
  }

  // Count today's usage for free/pro tiers
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  const usageRecords = await db
    .select()
    .from(aiAgentUsage)
    .where(and(eq(aiAgentUsage.userId, userId), sql`${aiAgentUsage.date} = CURRENT_DATE`));

  const used = usageRecords.length;
  const remaining = Math.max(0, limit - used);

  // Calculate resets_at (midnight UTC next day)
  const now = new Date();
  const resetDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );

  return {
    used,
    limit,
    remaining,
    resets_at: resetDate.toISOString(),
  };
}

/**
 * GET /ai-agent/questions
 * Returns available questions - either initial questions or follow-ups for a parent
 * Query params:
 *   - parent_id (optional): Parent question ID to get follow-ups for
 */
aiAgentRoutes.get('/questions', async (c) => {
  const parentId = c.req.query('parent_id');

  if (parentId) {
    // Return follow-up questions for the specified parent
    const questions = getFollowUpQuestions(parentId);
    return c.json(success({ questions }), 200);
  }

  // Return initial category questions
  const questions = getInitialQuestions();
  return c.json(success({ questions }), 200);
});

/**
 * POST /ai-agent/ask
 * Submit a question and get an AI-generated response
 * Body: { question_id: string, ticker: string }
 */
aiAgentRoutes.post('/ask', async (c) => {
  const body = await c.req.json();
  const { question_id, ticker } = body;
  const user = c.get('user');

  // Validate request body
  if (!question_id || typeof question_id !== 'string') {
    throw new ValidationError('question_id is required and must be a string');
  }

  if (!ticker || typeof ticker !== 'string') {
    throw new ValidationError('ticker is required and must be a string');
  }

  // Validate question exists
  const question = getQuestionById(question_id);
  if (!question) {
    throw new NotFoundError(`Question '${question_id}' not found`);
  }

  // ─── Check tier limits BEFORE generating response ─────────────────────────
  if (!db) throw new InternalError('Database not available');

  const limit = TIER_LIMITS[user.tier.toLowerCase()] ?? 3;

  // For non-premium users, enforce daily limits
  if (limit !== Infinity) {
    const usageRecords = await db
      .select()
      .from(aiAgentUsage)
      .where(and(eq(aiAgentUsage.userId, user.id), sql`${aiAgentUsage.date} = CURRENT_DATE`));

    const used = usageRecords.length;

    if (used >= limit) {
      // Calculate resets_at for error response
      const now = new Date();
      const resetDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
      );

      throw new TierLimitError('Daily question limit reached', {
        used,
        limit,
        upgrade_prompt: true,
        resets_at: resetDate.toISOString(),
      });
    }
  }

  // ─── Generate response ─────────────────────────────────────────────────────
  let response: AiAgentResponseData;

  switch (question_id) {
    case 'financial_health':
      response = await respondFinancialHealth(ticker);
      break;
    case 'debt_analysis':
      response = await respondDebtAnalysis(ticker);
      break;
    case 'cash_position':
      response = await respondCashPosition(ticker);
      break;
    case 'analyst_view':
      response = await respondAnalystView(ticker);
      break;
    case 'recent_actions':
      response = await respondRecentActions(ticker);
      break;
    case 'price_targets':
      response = await respondPriceTargets(ticker);
      break;
    case 'insider_activity':
      response = await respondInsiderActivity(ticker);
      break;
    case 'top_holders':
      response = await respondTopHolders(ticker);
      break;
    case 'smart_money':
      response = await respondSmartMoney(ticker);
      break;
    case 'valuation':
      response = await respondValuation(ticker);
      break;
    case 'peer_valuation':
      response = await respondPeerValuation(ticker);
      break;
    case 'dividend_check':
      response = await respondDividendCheck(ticker);
      break;
    case 'earnings':
      response = await respondEarnings(ticker);
      break;
    case 'earnings_beats':
      response = await respondEarningsBeats(ticker);
      break;
    case 'earnings_outlook':
      response = await respondEarningsOutlook(ticker);
      break;
    case 'red_flags':
      response = await respondRedFlags(ticker);
      break;
    case 'critical_flags':
      response = await respondCriticalFlags(ticker);
      break;
    case 'flag_trend':
      response = await respondFlagTrend(ticker);
      break;
    default:
      throw new NotFoundError(`No responder found for question '${question_id}'`);
  }

  // ─── Track usage after successful response ────────────────────────────────
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  await db.insert(aiAgentUsage).values({
    userId: user.id,
    questionId: question_id,
    ticker: ticker.toUpperCase(),
    date: today,
  });

  // Get follow-up questions if this is an initial question
  const follow_up_questions =
    question.parent_id === null ? getFollowUpQuestions(question_id) : [];

  // Get updated usage stats
  const usage = await getUsageStats(user.id, user.tier);

  // Return response with follow-ups and usage
  return c.json(
    success({
      response,
      follow_up_questions,
      usage,
    }),
    200
  );
});

/**
 * GET /ai-agent/usage
 * Returns current user's daily usage stats
 */
aiAgentRoutes.get('/usage', async (c) => {
  const user = c.get('user');
  const usage = await getUsageStats(user.id, user.tier);

  return c.json(success(usage), 200);
});

export { aiAgentRoutes };
