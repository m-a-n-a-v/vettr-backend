import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { success } from '../utils/response.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
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

  // Call the appropriate responder function based on question_id
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

  // Get follow-up questions if this is an initial question
  const follow_up_questions =
    question.parent_id === null ? getFollowUpQuestions(question_id) : [];

  // Return response with follow-ups
  return c.json(
    success({
      response,
      follow_up_questions,
    }),
    200
  );
});

/**
 * GET /ai-agent/usage
 * Returns current user's daily usage stats
 * Note: This is a placeholder for US-095 which will implement actual tracking
 */
aiAgentRoutes.get('/usage', async (c) => {
  const user = c.get('user');

  // Tier limits
  const tierLimits: Record<string, number> = {
    free: 3,
    pro: 15,
    premium: Infinity,
  };

  const limit = tierLimits[user.tier.toLowerCase()] ?? 3;

  // Placeholder response - will be implemented in US-095
  const used = 0;
  const remaining = limit === Infinity ? Infinity : limit - used;

  // Calculate resets_at (midnight UTC next day)
  const now = new Date();
  const resetDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );

  return c.json(
    success({
      used,
      limit,
      remaining,
      resets_at: resetDate.toISOString(),
    }),
    200
  );
});

export { aiAgentRoutes };
