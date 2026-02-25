/**
 * AI Agent Question Registry
 * Defines all 18 pre-populated questions (6 initial categories + 12 follow-ups)
 */

export interface AiAgentQuestion {
  id: string;
  label: string;
  category: string;
  parent_id: string | null;
  icon: string;
}

/**
 * 6 Initial Category Questions
 */
const INITIAL_QUESTIONS: AiAgentQuestion[] = [
  {
    id: 'financial_health',
    label: 'How financially healthy is {TICKER}?',
    category: 'Financial Health',
    parent_id: null,
    icon: '💰',
  },
  {
    id: 'analyst_view',
    label: 'What do analysts say about {TICKER}?',
    category: 'Analyst View',
    parent_id: null,
    icon: '📊',
  },
  {
    id: 'insider_activity',
    label: 'Are insiders buying or selling {TICKER}?',
    category: 'Insider Activity',
    parent_id: null,
    icon: '👔',
  },
  {
    id: 'valuation',
    label: 'Is {TICKER} fairly valued?',
    category: 'Valuation',
    parent_id: null,
    icon: '💎',
  },
  {
    id: 'earnings',
    label: 'How strong are {TICKER}\'s earnings?',
    category: 'Earnings',
    parent_id: null,
    icon: '📈',
  },
  {
    id: 'red_flags',
    label: 'Any red flags for {TICKER}?',
    category: 'Red Flags',
    parent_id: null,
    icon: '🚩',
  },
];

/**
 * 12 Follow-up Questions (2 per category)
 */
const FOLLOW_UP_QUESTIONS: AiAgentQuestion[] = [
  // Financial Health follow-ups
  {
    id: 'debt_analysis',
    label: 'How much debt does {TICKER} have?',
    category: 'Financial Health',
    parent_id: 'financial_health',
    icon: '📉',
  },
  {
    id: 'cash_position',
    label: 'What is {TICKER}\'s cash position?',
    category: 'Financial Health',
    parent_id: 'financial_health',
    icon: '💵',
  },
  // Analyst View follow-ups
  {
    id: 'recent_actions',
    label: 'What are recent analyst actions on {TICKER}?',
    category: 'Analyst View',
    parent_id: 'analyst_view',
    icon: '📰',
  },
  {
    id: 'price_targets',
    label: 'What are analyst price targets for {TICKER}?',
    category: 'Analyst View',
    parent_id: 'analyst_view',
    icon: '🎯',
  },
  // Insider Activity follow-ups
  {
    id: 'top_holders',
    label: 'Who are the top holders of {TICKER}?',
    category: 'Insider Activity',
    parent_id: 'insider_activity',
    icon: '🏆',
  },
  {
    id: 'smart_money',
    label: 'Is smart money buying or selling {TICKER}?',
    category: 'Insider Activity',
    parent_id: 'insider_activity',
    icon: '🧠',
  },
  // Valuation follow-ups
  {
    id: 'peer_valuation',
    label: 'How does {TICKER} compare to its peers?',
    category: 'Valuation',
    parent_id: 'valuation',
    icon: '🔍',
  },
  {
    id: 'dividend_check',
    label: 'Does {TICKER} pay a dividend?',
    category: 'Valuation',
    parent_id: 'valuation',
    icon: '💸',
  },
  // Earnings follow-ups
  {
    id: 'earnings_beats',
    label: 'Is {TICKER} beating earnings estimates?',
    category: 'Earnings',
    parent_id: 'earnings',
    icon: '✅',
  },
  {
    id: 'earnings_outlook',
    label: 'What is the earnings outlook for {TICKER}?',
    category: 'Earnings',
    parent_id: 'earnings',
    icon: '🔮',
  },
  // Red Flags follow-ups
  {
    id: 'critical_flags',
    label: 'What is the most critical issue for {TICKER}?',
    category: 'Red Flags',
    parent_id: 'red_flags',
    icon: '⚠️',
  },
  {
    id: 'flag_trend',
    label: 'Are red flags increasing or decreasing for {TICKER}?',
    category: 'Red Flags',
    parent_id: 'red_flags',
    icon: '📉',
  },
];

/**
 * All 18 questions combined
 */
const ALL_QUESTIONS: AiAgentQuestion[] = [...INITIAL_QUESTIONS, ...FOLLOW_UP_QUESTIONS];

/**
 * Get all initial category questions (6 questions)
 */
export function getInitialQuestions(): AiAgentQuestion[] {
  return INITIAL_QUESTIONS;
}

/**
 * Get follow-up questions for a specific parent question
 * @param parentId - The parent question ID
 * @returns Array of follow-up questions for that parent
 */
export function getFollowUpQuestions(parentId: string): AiAgentQuestion[] {
  return FOLLOW_UP_QUESTIONS.filter(q => q.parent_id === parentId);
}

/**
 * Get a specific question by ID
 * @param id - The question ID
 * @returns The question object or undefined if not found
 */
export function getQuestionById(id: string): AiAgentQuestion | undefined {
  return ALL_QUESTIONS.find(q => q.id === id);
}

/**
 * Get all 18 questions
 */
export function getAllQuestions(): AiAgentQuestion[] {
  return ALL_QUESTIONS;
}
