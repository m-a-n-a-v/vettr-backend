# VETTR Score Snapshots - Ralph Agent Instructions

You are an autonomous coding agent working on the VETTR Backend API - a TypeScript/Hono REST API serving both iOS and Android mobile clients.

## Your Task

1. Read the PRD at `scripts/ralph/prd-snapshots.json`
2. Read the progress log at `scripts/ralph/progress-snapshots.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (see Quality Commands below)
7. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
8. Update the PRD to set `passes: true` for the completed story
9. Append your progress to `scripts/ralph/progress-snapshots.txt`

---

## Quality Commands

Execute these from the project root (`/Users/manav/Space/code/vettr-backend`):

**Build:**
```bash
npm run build
```

**Type check:**
```bash
npm run typecheck
```

All commits MUST pass the build command.

**IMPORTANT**: If `npm run build` fails and the issue is with import paths, make sure all local imports use the `.js` extension (e.g., `import { app } from './app.js'`). This is required for ESM with NodeNext module resolution.

---

## Key Context

### What already exists:
- `src/db/schema/vetr-scores.ts` — existing `vetr_score_history` table (full audit log of every score calculation)
- `src/services/vetr-score.service.ts` — `calculateVetrScore()` returns `VetrScoreResult` with `overall_score` and 4 pillar component scores
- `src/services/cron.service.ts` — `refreshScoresChunk()` processes all tickers, calls `calculateVetrScore()` for each
- `src/routes/vetr-score.routes.ts` — existing endpoints for score, history, trend, compare
- `src/routes/cron.routes.ts` — existing cron endpoints (market-data, scores, red-flags, status, reset, history)
- `src/db/schema/index.ts` — barrel export for all schema files

### What we're building:
A **lean time-series table** (`vetr_score_snapshots`) with exactly **one row per ticker per hour**. This is separate from the existing `vetr_score_history` table which is a full audit log. The snapshots table is optimized for:
- Chart rendering (time-series queries)
- Trend analysis (score over time with price correlation)
- Space efficiency (upsert deduplicates, 90-day retention)

### VetrScoreResult type (from vetr-score.service.ts):
```typescript
interface VetrScoreResult {
  ticker: string;
  overall_score: number;
  components: {
    financial_survival: { score: number; weight: number; sub_scores: { cash_runway: number; solvency: number } };
    operational_efficiency: { score: number; weight: number; sub_scores: { efficiency_ratio: number } };
    shareholder_structure: { score: number; weight: number; sub_scores: { pedigree: number; dilution_penalty: number; insider_alignment: number } };
    market_sentiment: { score: number; weight: number; sub_scores: { liquidity: number; news_velocity: number } };
  };
  null_pillars: string[];
  calculated_at: string;
}
```

---

## Folder Structure

```
src/
├── db/schema/
│   ├── index.ts              # Schema barrel export — add new schema here
│   ├── vetr-scores.ts        # Existing vetr_score_history table
│   └── vetr-score-snapshots.ts  # NEW — create this
├── services/
│   ├── vetr-score.service.ts  # calculateVetrScore() — DO NOT MODIFY
│   ├── cron.service.ts        # refreshScoresChunk() — MODIFY to add snapshot upserts
│   ├── cache.service.ts       # Redis cache wrapper
│   └── snapshot.service.ts    # NEW — create this
├── routes/
│   ├── vetr-score.routes.ts   # Add /chart endpoint here
│   └── cron.routes.ts         # Add /snapshot-stats and /snapshot-cleanup here
```

---

## Codebase Patterns

### Drizzle Schema
- Use `pgTable` for table definitions
- Use `uuid` for primary keys with `defaultRandom()`
- Use `timestamp` for dates with `defaultNow()`
- Indexes: use `index()` helper in the table's second argument
- Unique constraints: use `unique()` helper
- Example with composite unique:
```typescript
import { pgTable, uuid, varchar, integer, timestamp, index, unique } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  score: integer('score').notNull(),
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
}, (table) => ({
  tickerTimeIdx: index('my_table_ticker_time_idx').on(table.ticker, table.recordedAt),
  tickerTimeUnique: unique('my_table_ticker_time_unique').on(table.ticker, table.recordedAt),
}));
```

### Service Pattern
- Services are plain exported async functions
- Import `db` from `'../config/database.js'`
- Import schema from `'../db/schema/index.js'`
- Use `eq`, `and`, `gte`, `lt`, `desc`, `asc`, `sql` from `'drizzle-orm'`

### Hono Routes
- Use `Hono` instances for route groups
- Use `c.json(success(data))` for responses
- Import `success` from `'../utils/response.js'`

### JSON Field Naming
- ALL JSON API fields use `snake_case`
- TypeScript code uses camelCase internally

### ESM Imports
- ALL local imports MUST use `.js` extension (e.g., `'./snapshot.service.js'`)

---

## Common Gotchas

1. **ESM Imports**: All local imports MUST use `.js` extension
2. **Drizzle**: Use `drizzle-orm/pg-core` for PostgreSQL-specific types
3. **Hono**: Use `c.json()` for responses, `c.req.query()` for query params
4. **SQL date_trunc**: For hour truncation use `sql\`date_trunc('hour', now())\``
5. **Drizzle onConflictDoUpdate**: target must reference unique constraint columns
6. **Dates**: Store as `timestamp` in DB, return as ISO 8601 strings in API

---

## Progress Report Format

APPEND to scripts/ralph/progress-snapshots.txt (never replace, always append):

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

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete, reply with:
```
<promise>COMPLETE</promise>
```

If there are still stories with `passes: false`, end your response normally.

---

## Important

- Work on ONE story per iteration
- Commit frequently with descriptive messages
- Keep builds green (npm run build must pass)
- Use existing patterns from the codebase
- snake_case for ALL JSON API responses
- All local imports use .js extension (ESM requirement)
- DO NOT modify vetr-score.service.ts — only read from its types/exports
