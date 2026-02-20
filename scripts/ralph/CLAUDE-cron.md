# VETTR Cron Jobs - Ralph Agent Instructions

You are an autonomous coding agent adding Vercel Cron Jobs to the VETTR Backend API for periodic data refresh of ALL 1300+ stock tickers.

## Your Task

1. Read the PRD at `scripts/ralph/prd-cron.json`
2. Read the progress log at `scripts/ralph/progress-cron.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName` (`ralph/vettr-cron`). If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (see Quality Commands below)
7. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
8. Update the PRD (`scripts/ralph/prd-cron.json`) to set `passes: true` for the completed story
9. Append your progress to `scripts/ralph/progress-cron.txt`

---

## Quality Commands

Execute from the project root (`/Users/manav/Space/code/vettr-backend`):

**Build:**
```bash
npm run build
```

**Test:**
```bash
npm run test
```

**Type check:**
```bash
npm run typecheck
```

All commits MUST pass the build command. Tests must pass from CRON-006 onwards.

**IMPORTANT**: If `npm run build` fails and the issue is with import paths, make sure all local imports use the `.js` extension (e.g., `import { app } from './app.js'`). This is required for ESM with NodeNext module resolution.

---

## Project Context

This is the VETTR Backend API — a TypeScript/Hono REST API deployed on Vercel. The backend already has:

- **85 user stories** implemented (complete CRUD, auth, scoring, red flags, etc.)
- **65 ops dashboard stories** implemented (admin CRUD, analytics, bulk operations)
- **1300+ stock tickers** in the Neon PostgreSQL database
- **VETR Score engine** (`calculateVetrScore(ticker)`) — 4-pillar scoring with Redis caching (24h TTL)
- **Red Flag detector** (`detectRedFlags(ticker)`) — 5 detectors with Redis caching (24h TTL)
- **Vercel deployment** — Hono framework auto-detected via `api/index.ts`

### What You're Building

Vercel Cron Jobs that run every 6 hours to refresh VETR scores and red flags for ALL 1300+ tickers. Since Vercel functions have a max timeout of 300 seconds (5 minutes), you CANNOT process all 1300+ tickers in one invocation. Instead, use **chunked processing with Redis cursor tracking**:

1. Each cron invocation processes a chunk of ~100 tickers
2. A Redis cursor tracks where to resume on the next invocation
3. After ~13 invocations (every 6 hours), all tickers are refreshed (~78 hours for a full cycle)
4. The cursor auto-resets when it reaches the end (or after 24h TTL)

### Key Architecture Decisions

- **Vercel Crons** use GET requests to paths defined in `vercel.json`
- **Cron auth** uses `Authorization: Bearer <CRON_SECRET>` (different from admin's `X-Admin-Secret`)
- **Batch concurrency**: Process 10 tickers in parallel within each chunk (using Promise.allSettled)
- **Chunk size**: 100 tickers per invocation (configurable)
- **Schedule**: Every 6 hours (`0 */6 * * *`)

---

## Folder Structure (What Already Exists)

```
src/
├── app.ts                        # Hono app + middleware registration
├── config/
│   ├── env.ts                    # Zod env schema (add CRON_SECRET here)
│   ├── database.ts               # Drizzle + Neon PostgreSQL
│   └── redis.ts                  # Upstash Redis client
├── db/schema/
│   ├── index.ts                  # Schema barrel export
│   ├── stocks.ts                 # stocks table
│   └── ...                       # 13 other table schemas
├── middleware/
│   ├── admin-auth.ts             # X-Admin-Secret middleware (reference pattern)
│   ├── auth.ts                   # JWT auth middleware
│   └── ...
├── routes/
│   ├── index.ts                  # Route barrel export
│   ├── admin.routes.ts           # Admin endpoints (700+ lines)
│   └── ...                       # 15 other route files
├── services/
│   ├── vetr-score.service.ts     # calculateVetrScore(ticker) → VetrScoreResult
│   ├── red-flag.service.ts       # detectRedFlags(ticker) → DetectedFlagResult
│   ├── cache.service.ts          # Redis cache wrapper (get/set/del with TTL)
│   └── ...
└── utils/
    ├── response.ts               # success(), error() response builders
    └── errors.ts                 # AppError, NotFoundError, AuthRequiredError, etc.
```

### Files You'll Create

```
src/
├── middleware/
│   └── cron-auth.ts              # CRON-001: Bearer token auth for cron routes
├── services/
│   └── cron.service.ts           # CRON-002: Chunked batch processing logic
├── routes/
│   └── cron.routes.ts            # CRON-003: GET endpoints for Vercel crons
└── db/schema/
    └── cron-jobs.ts              # CRON-007: cron_job_runs history table
```

### Files You'll Modify

```
src/config/env.ts                 # CRON-001: Add CRON_SECRET field
src/routes/index.ts               # CRON-004: Export cronRoutes
src/app.ts                        # CRON-004: Register cron routes
src/db/schema/index.ts            # CRON-007: Export cron-jobs schema
vercel.json                       # CRON-005: Add crons array + functions config
```

---

## Codebase Patterns

### Admin Auth Pattern (Reference for Cron Auth)
```typescript
// src/middleware/admin-auth.ts
import { env } from '../config/env.js';
import { AuthRequiredError } from '../utils/errors.js';
import type { Context, Next } from 'hono';

export async function adminAuthMiddleware(c: Context, next: Next): Promise<void> {
  const adminSecret = env.ADMIN_SECRET;
  if (!adminSecret) { await next(); return; } // dev mode bypass
  const providedSecret = c.req.header('X-Admin-Secret');
  if (!providedSecret || providedSecret !== adminSecret) {
    throw new AuthRequiredError('Invalid admin secret');
  }
  await next();
}
```

### Cache Service Pattern
```typescript
import * as cache from './cache.service.js';

// Get a value (returns null if not found)
const offset = await cache.get<number>('cron:scores:offset');

// Set with TTL (seconds)
await cache.set('cron:scores:offset', 100, 86400); // 24h TTL

// Delete
await cache.del('cron:scores:offset');
```

### Service Function Signatures
```typescript
// vetr-score.service.ts
export async function calculateVetrScore(ticker: string): Promise<VetrScoreResult>
// VetrScoreResult has: ticker, overall_score, pillar scores, etc.
// Handles its own caching (24h Redis TTL), DB writes (vetr_score_history, stocks.vetrScore)

// red-flag.service.ts
export async function detectRedFlags(ticker: string): Promise<DetectedFlagResult>
// DetectedFlagResult has: ticker, composite_score, severity, flags[]
// Handles its own caching (24h Redis TTL), DB writes (red_flag_history)
```

### Hono Route Pattern
```typescript
import { Hono } from 'hono';
import { success } from '../utils/response.js';

const routes = new Hono();
routes.use('*', someMiddleware);

routes.get('/endpoint', async (c) => {
  const result = await someService();
  return c.json(success(result));
});

export { routes as myRoutes };
```

### Drizzle Schema Pattern
```typescript
import { pgTable, uuid, varchar, integer, timestamp, jsonb, text } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull(),
  count: integer('count').default(0),
  data: jsonb('data'),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### Response Pattern
```typescript
import { success } from '../utils/response.js';

// All responses use: { success: true, data: {...}, meta: { timestamp, request_id } }
return c.json(success(data));
```

### Query Pattern
```typescript
import { db } from '../config/database.js';
import { stocks } from '../db/schema/index.js';
import { asc } from 'drizzle-orm';

const allStocks = await db
  .select({ ticker: stocks.ticker })
  .from(stocks)
  .orderBy(asc(stocks.ticker));
```

---

## Common Gotchas

1. **ESM Imports**: All local imports MUST use `.js` extension (e.g., `'./app.js'` not `'./app'`)
2. **Hono Context**: Use `c.json()` for responses
3. **Redis in dev**: Cache service gracefully handles missing Redis (returns null for get, no-ops for set/del)
4. **calculateVetrScore and detectRedFlags**: These already handle their own caching and DB writes. You don't need to manually update the stocks table or score history — the service functions do it all.
5. **Drizzle**: Use `drizzle-orm/pg-core` for PostgreSQL-specific types
6. **UUID**: Use `crypto.randomUUID()` for Node.js 20+
7. **Vercel crons**: Production-only feature. In dev, you test by calling the endpoints manually
8. **Vercel cron auth**: Vercel automatically adds `Authorization: Bearer <CRON_SECRET>` to cron requests if CRON_SECRET env var is set in the Vercel project settings
9. **vercel.json**: The `functions` config with `maxDuration` applies to all functions in `api/index.ts` (our single Vercel entry point)
10. **Promise.allSettled**: Use this instead of Promise.all for batch processing — it doesn't short-circuit on failures

---

## Progress Report Format

APPEND to scripts/ralph/progress-cron.txt (never replace, always append):

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
  - Useful context
---
```

---

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
```
<promise>COMPLETE</promise>
```

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

---

## Important

- Work on ONE story per iteration
- Commit frequently with descriptive messages: `feat: CRON-XXX - Title`
- Keep builds green (npm run build must pass)
- Read the Codebase Patterns section in progress-cron.txt before starting
- snake_case for ALL JSON API responses
- All local imports use .js extension (ESM requirement)
- The existing services (calculateVetrScore, detectRedFlags) handle their own caching and DB writes
- Use Promise.allSettled for concurrent processing within batches
- Redis cursor keys: 'cron:scores:offset' and 'cron:red-flags:offset'
