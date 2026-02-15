# VETTR Backend - Ralph Agent Instructions

You are an autonomous coding agent working on the VETTR Backend API - a TypeScript/Hono REST API serving both iOS and Android mobile clients.

## Your Task

1. Read the PRD at `scripts/ralph/prd.json`
2. Read the progress log at `scripts/ralph/progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (see Quality Commands below)
7. Update CLAUDE.md files if you discover reusable patterns
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `scripts/ralph/progress.txt`

---

## Quality Commands

Execute these from the project root (`/Users/manav/Space/code/vettr-backend`):

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

All commits MUST pass the build command. Tests will be added progressively.

**IMPORTANT**: If `npm run build` fails and the issue is with import paths, make sure all local imports use the `.js` extension (e.g., `import { app } from './app.js'`). This is required for ESM with NodeNext module resolution.

---

## Folder Structure

```
src/
├── index.ts                      # Entry point (port 3000)
├── app.ts                        # Hono app + middleware registration
├── config/
│   ├── env.ts                    # Environment variable validation (Zod)
│   ├── database.ts               # Drizzle + Neon PostgreSQL connection
│   └── redis.ts                  # Upstash Redis client
├── db/
│   ├── schema/
│   │   ├── index.ts              # Schema barrel export
│   │   ├── users.ts              # users + refresh_tokens tables
│   │   ├── stocks.ts             # stocks table
│   │   ├── filings.ts            # filings + filing_reads tables
│   │   ├── executives.ts         # executives table
│   │   ├── financial-data.ts       # financial_data table (15 financial fields)
│   │   ├── alert-rules.ts        # alert_rules table
│   │   ├── alerts.ts             # alerts table
│   │   ├── watchlists.ts         # watchlist_items table
│   │   ├── vetr-scores.ts        # vetr_score_history table
│   │   ├── red-flags.ts          # red_flag_history + acknowledgments tables
│   │   ├── sync.ts               # sync_history table
│   │   └── user-settings.ts      # user_settings table
│   └── seed/
│       ├── index.ts              # Seed runner
│       ├── stocks.ts             # 25 pilot Canadian stocks
│       ├── filings.ts            # Sample filings (3 per stock)
│       ├── executives.ts         # Sample executives (3-5 per stock)
│       └── financial-data.ts       # Sector-realistic financial data (25 stocks)
├── middleware/
│   ├── auth.ts                   # JWT verification, attach user to context
│   ├── rate-limit.ts             # Tier-based rate limiting (Upstash)
│   ├── error-handler.ts          # Global error handler
│   └── validator.ts              # Zod request validation helper
├── routes/
│   ├── index.ts                  # Route registration barrel
│   ├── auth.routes.ts            # POST /auth/signup, login, google, apple, refresh, logout
│   ├── stocks.routes.ts          # GET /stocks, /stocks/:ticker, search
│   ├── filings.routes.ts         # GET /filings, /filings/:id, POST read
│   ├── executives.routes.ts      # GET /executives/search, /:id
│   ├── vetr-score.routes.ts      # GET /stocks/:ticker/vetr-score/*
│   ├── red-flags.routes.ts       # GET /stocks/:ticker/red-flags/*, /red-flags/*
│   ├── alerts.routes.ts          # CRUD /alerts/rules/*
│   ├── watchlist.routes.ts       # GET/POST/DELETE /watchlist/*
│   ├── sync.routes.ts            # POST /sync/pull, push, resolve
│   ├── users.routes.ts           # GET/PUT /users/me, settings
│   └── health.routes.ts          # GET /health
├── services/
│   ├── auth.service.ts           # JWT, OAuth verification, user creation
│   ├── stock.service.ts          # Stock CRUD + search + pagination
│   ├── filing.service.ts         # Filing CRUD + per-user read status
│   ├── executive.service.ts      # Executive CRUD + search
│   ├── vetr-score.service.ts     # VETR Score V2 calculation (4 pillars)
│   ├── red-flag.service.ts       # Red Flag detection (5 algorithms)
│   ├── alert-rule.service.ts     # Alert rule CRUD + limits
│   ├── watchlist.service.ts      # Watchlist CRUD + tier limits
│   ├── sync.service.ts           # Sync pull/push/resolve
│   ├── user.service.ts           # User profile + settings
│   └── cache.service.ts          # Redis cache wrapper
├── types/
│   ├── api.ts                    # Standardized response types
│   ├── auth.ts                   # Auth-related types
│   ├── pagination.ts             # Pagination types
│   └── index.ts                  # Type barrel export
└── utils/
    ├── jwt.ts                    # JWT sign/verify helpers
    ├── password.ts               # bcrypt hash/compare
    ├── pagination.ts             # Pagination helpers
    ├── response.ts               # Standardized response builder
    └── errors.ts                 # Custom error classes (AppError, etc.)
```

---

## Codebase Patterns

### Hono Routes
- Use `Hono` instances for route groups, mount on main app
- Use middleware for auth, validation
- Example:
```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

const stockRoutes = new Hono();

stockRoutes.use('*', authMiddleware);

stockRoutes.get('/', async (c) => {
  const { limit, offset, sector, search } = c.req.query();
  // ...service call
  return c.json({ success: true, data: stocks, pagination: {...} });
});

export { stockRoutes };
```

### Service Pattern
- Services are plain functions or classes (NO decorators)
- Accept Drizzle db instance as parameter
- Return typed results
- Example:
```typescript
import { db } from '../config/database.js';
import { stocks } from '../db/schema/index.js';
import { eq, like } from 'drizzle-orm';

export async function getStocks(options: { limit: number; offset: number; sector?: string }) {
  const query = db.select().from(stocks);
  // ... add filters
  return await query.limit(options.limit).offset(options.offset);
}
```

### Drizzle Schema
- Use `pgTable` for table definitions
- Use `uuid` for primary keys with `defaultRandom()`
- Use `timestamp` for dates with `defaultNow()`
- Example:
```typescript
import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  tier: varchar('tier', { length: 20 }).notNull().default('free'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### Standardized API Responses
- ALL responses use `{ success: true/false, data/error, meta }` format
- Paginated: `{ success, data: [], pagination: { total, limit, offset, has_more }, meta }`
- Errors: `{ success: false, error: { code, message, details } }`
- Use the response builder utility for consistency

### Environment Variables
- Validated with Zod at startup
- Access via `env` import from `config/env.ts`
- Never use `process.env` directly in service code

### Error Handling
- Throw `AppError` subclasses from services
- Global error handler catches and formats responses
- Error codes: AUTH_REQUIRED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED, TIER_LIMIT_EXCEEDED, CONFLICT, INTERNAL_ERROR

### JSON Field Naming
- ALL JSON fields use `snake_case` (matching Android DTOs with @SerializedName)
- Database columns also use snake_case
- TypeScript code uses camelCase internally, Drizzle handles mapping

### Authentication
- JWT access tokens (15min TTL) with `{ sub, email, tier }`
- Refresh tokens (30d) stored hashed in DB, rotation on each refresh
- Auth middleware extracts JWT, attaches user to Hono context
- Use `c.get('user')` to access authenticated user in routes

### Tier-Based Limits
- FREE: 5 watchlist, 24h sync, 12h pulse delay
- PRO: 25 watchlist, 12h sync, 4h pulse delay
- PREMIUM: unlimited watchlist, 4h sync, real-time
- All limits enforced in service layer, not routes

---

## Common Gotchas

1. **ESM Imports**: All local imports MUST use `.js` extension (e.g., `'./app.js'` not `'./app'` or `'./app.ts'`)
2. **Drizzle**: Use `drizzle-orm/pg-core` for PostgreSQL-specific types
3. **Hono Context**: Use `c.json()` for responses, `c.req.json()` for request body
4. **Zod**: Always `.parse()` or `.safeParse()` request bodies before using
5. **UUID**: Use `crypto.randomUUID()` for Node.js 20+ or `uuid` package
6. **Dates**: Store as `timestamp` in DB, return as ISO 8601 strings in API
7. **JSONB**: Use `jsonb` type in Drizzle for complex nested data (trigger_conditions, previous_companies)
8. **bcrypt**: Use async `hash()` and `compare()`, never sync versions
9. **JWT**: Always verify token signature and expiry; extract claims after verification
10. **Neon**: Use `@neondatabase/serverless` driver, connection string with `?sslmode=require`

---

## Reference: VETR Score V2 Calculation (4-Pillar System)

The new score uses 4 pillars with null-pillar weight redistribution:

1. **Financial Survival (35%)**: Cash Runway (60%) + Solvency (40%)
   - Cash Runway: months = cash / monthly_burn, normalized to 18 months = 100
   - Solvency: max(0, 100 - (total_debt / total_assets) * 200)
2. **Operational Efficiency (25%)**: Sector-specific ratio / 0.70 * 100
   - Mining: exploration_exp / total_opex
   - Tech: r_and_d_exp / total_opex
   - General: (revenue - g_and_a_expense) / revenue
3. **Shareholder Structure (25%)**: Pedigree (50%) + Dilution (30%) + Insider (20%)
   - Pedigree: PG = E×0.40 + C×0.25 + A×0.20 + M×0.15
   - Dilution: max(0, 100 - dilution_pct * 200)
   - Insider: min(100, ownership_pct / 0.20 * 100)
4. **Market Sentiment (15%)**: Liquidity (60%) + News Velocity (40%)
   - Liquidity: min(100, (avg_vol_30d * price) / 100000 * 100)
   - News Velocity: linear decay from 100 (14d) to 0 (60d)

Null pillars: if a pillar's inputs are ALL null, skip it and redistribute weight proportionally.

5-Tier Color Grading:
| Range | Color | Hex |
|-------|-------|-----|
| 90-100 | Dark Green | #166534 |
| 75-89 | Green | #00E676 |
| 50-74 | Yellow | #FBBF24 |
| 30-49 | Orange | #FB923C |
| 0-29 | Red | #F87171 |

New DB table: `financial_data` (15 financial fields, one-to-one with stocks via stock_id FK)

## Reference: Red Flag Detection

Port from Android's RedFlagDetector.kt. Types:
1. **Consolidation Velocity (30%)**: 1→20pts, 2→40pts, 3-4→60-80pts, 5+→100pts
2. **Financing Velocity (25%)**: Early-stage $50M / Growth $100M thresholds
3. **Executive Churn (20%)**: 1→25pts, 2→50pts, 3→75pts, 4+→100pts
4. **Disclosure Gaps (15%)**: Overdue→100pts, 90+d→75pts, 60-89d→50pts, 30-59d→25pts
5. **Debt Trend (10%)**: 100%+ increase w/<20% rev growth→100pts, etc.
- Composite = weighted sum
- Severity: Low (<30), Moderate (30-60), High (60-85), Critical (>85)

---

## Progress Report Format

APPEND to scripts/ralph/progress.txt (never replace, always append):

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
- Commit frequently with descriptive messages
- Keep builds green (npm run build must pass)
- Read the Codebase Patterns section in progress.txt before starting
- Use mock/seed data for realistic test data (same 25 Canadian stocks from iOS/Android)
- snake_case for ALL JSON API responses
- All local imports use .js extension (ESM requirement)
