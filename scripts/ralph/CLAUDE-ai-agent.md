# VETTR Backend AI Agent - Ralph Agent Instructions

You are an autonomous coding agent adding the VETTR AI Agent feature to the existing VETTR Backend API.

## Your Task

1. Read the PRD at `scripts/ralph/prd-ai-agent.json`
2. Read the progress log at `scripts/ralph/progress-ai-agent.txt` (create if doesn't exist)
3. Check you're on the correct branch from PRD `branchName`. If not, create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (see Quality Commands below)
7. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
8. Update the PRD to set `passes: true` for the completed story
9. Append your progress to `scripts/ralph/progress-ai-agent.txt`

---

## Quality Commands

Execute from project root (`/Users/manav/Space/code/vettr-backend`):

```bash
npm run build
npm run test
npm run typecheck
```

All commits MUST pass the build command. Tests must pass from US-088 onward.

**IMPORTANT**: All local imports MUST use `.js` extension (ESM requirement).

---

## Context: What You're Building

The AI Agent is a **pre-defined question/answer system** — NOT an LLM. Users select from 18 fixed questions about a stock ticker, and the backend queries existing DB tables to generate template-based, opinionated responses with verdicts.

**Architecture:**
- `src/db/schema/ai-agent-usage.ts` — Usage tracking table
- `src/services/ai-agent-questions.ts` — Hardcoded question registry (18 questions)
- `src/services/ai-agent-responders.ts` — Response generators (query DB, format responses)
- `src/routes/ai-agent.routes.ts` — 3 API endpoints
- `src/__tests__/ai-agent.test.ts` — Tests

**Question Categories (6 initial + 12 follow-ups):**
1. Financial Health → debt_analysis, cash_position
2. Analyst View → recent_actions, price_targets
3. Insider Activity → top_holders, smart_money
4. Valuation → peer_valuation, dividend_check
5. Earnings → earnings_beats, earnings_outlook
6. Red Flags → critical_flags, flag_trend

**Response Shape:**
```typescript
interface AiAgentResponseData {
  summary: string;        // Opinionated summary with **bold** key numbers
  details: Array<{
    label: string;        // Metric name
    value: string;        // Formatted value
    status: 'safe' | 'warning' | 'danger' | 'neutral';
  }>;
  verdict: string;        // One-word assessment (e.g., "Strong", "Caution")
  verdict_color: 'green' | 'yellow' | 'red';
}
```

**Tier Limits:** FREE=3/day, PRO=15/day, PREMIUM=unlimited

---

## Existing Code to Reuse

### DB Query Pattern (from fundamentals.service.ts)
```typescript
import { db } from '../config/database.js';
import { stocks, financialSummary, valuationMetrics } from '../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';

// Null-safe helper — use this everywhere
function n(val: number | null | undefined, fallback = 0): number {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return fallback;
  return val;
}

// Parallel queries for performance
const [valMetrics, finSummary] = await Promise.all([
  db.select().from(valuationMetrics).where(eq(valuationMetrics.stockId, stockId)).limit(1),
  db.select().from(financialSummary).where(eq(financialSummary.stockId, stockId)).limit(1),
]);
```

### Route Pattern
```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import type { AuthUser } from '../middleware/auth.js';

type Variables = { requestId: string; user: AuthUser };
const aiAgentRoutes = new Hono<{ Variables: Variables }>();
aiAgentRoutes.use('*', authMiddleware);

aiAgentRoutes.get('/questions', async (c) => {
  const parentId = c.req.query('parent_id');
  // ... return questions
  return c.json(success({ questions }), 200);
});
```

### Error Handling
```typescript
import { NotFoundError, TierLimitError } from '../utils/errors.js';
// Throw errors — global handler formats response
throw new NotFoundError(`Stock '${ticker}' not found`);
```

### Available DB Tables (from src/db/schema/)
- `stocks` — ticker, name, sector, price, marketCap, vetrScore
- `financialSummary` — totalCash, totalDebt, totalRevenue, ebitda, freeCashFlow, operatingCashFlow, currentRatio, quickRatio, grossMargins, operatingMargins, netIncome, revenueGrowth
- `valuationMetrics` — peRatio, forwardPE, enterpriseToEbitda, totalDebtToEquity, returnOnEquity
- `analystConsensus` — totalAnalysts, consensus, buyCount, holdCount, sellCount, priceTarget, priceTargetHigh, priceTargetLow, recommendationTrend
- `analystActions` — firm, action, fromGrade, toGrade, actionDate
- `majorHoldersBreakdown` — insidersPercentHeld, institutionsPercentHeld, institutionsCount
- `insiderTransactions` — filerName, filerRelation, transactionText, shares, transactionDate
- `earningsHistory` — quarter, epsActual, epsEstimate, epsDifference, surprisePercent
- `earningsEstimates` — (forward estimates)
- `dividendInfo` — dividendYield, exDividendDate
- `shortInterest` — shortShares, shortInterestPct, daysToCover30d
- `redFlagHistory` — (use existing red-flag.service.ts)

---

## Writing Opinionated Summaries

Summaries should be conversational and direct. Use **bold** for key numbers. Include the company name (from stocks table). Examples:

**Financial Health (green):**
> "**Shopify** is in **strong financial health**. With an Altman Z-Score of **4.2** (Safe Zone) and **36+ months** of cash runway, the company has a solid financial cushion. The current ratio of **2.1** and low debt-to-equity of **0.15** suggest minimal solvency risk."

**Analyst View (yellow):**
> "Analysts are **cautiously optimistic** on **Royal Bank of Canada**. Of **12 analysts**, the split is **5 Buy / 6 Hold / 1 Sell** with a consensus price target of **$142.50** — representing **8.3% upside** from the current price."

**Red Flags (red):**
> "**Warning signs detected** for **Bombardier**. The red flag score of **72/100** (High) flags **3 active concerns**: executive churn, elevated debt trend, and financing velocity. The most critical issue is the **40% executive turnover** in the past 12 months."

---

## Common Gotchas

1. **ESM Imports**: All local imports use `.js` extension
2. **snake_case**: ALL JSON response fields use snake_case
3. **Null safety**: Always use the `n()` helper for numeric DB values
4. **Stock lookup**: Always verify ticker exists in stocks table before querying other tables
5. **Date handling**: Use `sql\`CURRENT_DATE\`` for daily grouping in usage table
6. **Tier from auth**: Access via `c.get('user').tier` — values are 'free', 'pro', 'premium'

---

## Progress Report Format

APPEND to scripts/ralph/progress-ai-agent.txt:

```
## [Story ID]: [Story Title]
Status: ✅ COMPLETE
Date: [date]
Details:
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
---
```

---

## Stop Condition

After completing a story, check if ALL stories have `passes: true`.
If ALL complete: `<promise>COMPLETE</promise>`
If stories remain: end normally for next iteration.
