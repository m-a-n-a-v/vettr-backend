# VETTR Ops Dashboard - Ralph Agent Instructions

You are an autonomous coding agent building the VETTR Ops Dashboard — an internal admin web app for managing all backend data. This project spans two codebases:

- **Backend** (OPS-001 to OPS-019): `/Users/manav/Space/code/vettr-backend/`
- **Frontend** (OPS-020 to OPS-065): `/Users/manav/Space/code/vettr-ops-dashboard/`

## Your Task

1. Read the PRD at `scripts/ralph/prd-ops.json`
2. Read the progress log at `scripts/ralph/progress-ops.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName` (`ralph/vettr-ops`). If not, check it out or create from current HEAD.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (see Quality Commands below)
7. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
8. Update the PRD (`scripts/ralph/prd-ops.json`) to set `passes: true` for the completed story
9. Append your progress to `scripts/ralph/progress-ops.txt`

---

## Quality Commands

### Backend Stories (OPS-001 to OPS-019)

Execute from: `/Users/manav/Space/code/vettr-backend`

```bash
npm run build
npm run typecheck
```

Both MUST pass before committing.

### Frontend Stories (OPS-020 to OPS-065)

Execute from: `/Users/manav/Space/code/vettr-ops-dashboard`

```bash
npm run build
```

Must pass before committing. For OPS-020 (project initialization), you need to create the project first.

**IMPORTANT for ALL code**: If `npm run build` fails with import path errors, ensure all local imports use the `.js` extension for backend code (ESM with NodeNext). Frontend (Vite/React) does NOT need .js extensions.

---

## Project Architecture

### Backend (vettr-backend)

The backend is a complete TypeScript/Hono REST API with 85 user stories already implemented. You are ADDING admin CRUD routes to this existing codebase.

**Key existing files:**
- `src/routes/admin.routes.ts` — Currently has `GET /metrics` only. Register ALL new admin CRUD routes here.
- `src/services/admin.service.ts` — Currently has `getSystemMetrics()`. Extend with analytics.
- `src/middleware/admin-auth.ts` — Already working. Checks `X-Admin-Secret` header.
- `src/utils/response.ts` — Has `success()`, `error()`, `paginated()` helpers. USE THESE.
- `src/utils/errors.ts` — Has `AppError`, `NotFoundError`, `ValidationError` etc. USE THESE.
- `src/db/schema/index.ts` — Barrel export of all 14 table schemas.
- `src/config/database.ts` — Exports `db` (Drizzle instance with `pg` driver).

**New files to create:**
- `src/services/admin-crud.service.ts` — Generic CRUD service for any Drizzle table
- `src/routes/admin-crud.factory.ts` — Route factory generating Hono routers

**Database:** Local Docker PostgreSQL on `postgresql://vettr:vettr_dev@localhost:5432/vettr`
**Redis:** Local Docker Redis on `redis://localhost:6379`

### Frontend (vettr-ops-dashboard)

A NEW React project. OPS-020 initializes it from scratch.

**Tech stack:**
- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS v4 (styling)
- React Router v7 (routing)
- TanStack Query v5 (data fetching)
- Recharts v2 (charts)
- Axios (HTTP client)
- react-hot-toast (notifications)

**API:** Connects to `http://localhost:3000/v1` (the vettr-backend).
**Auth:** Login page enters admin secret → stored in `sessionStorage` → sent as `X-Admin-Secret` header on every request.

---

## Codebase Patterns

### Backend Patterns

**Hono Routes:**
```typescript
import { Hono } from 'hono';
const routes = new Hono();
routes.get('/', async (c) => {
  return c.json(success(data));
});
```

**Service Pattern:**
```typescript
import { db } from '../config/database.js';
import { eq, like, sql } from 'drizzle-orm';

export async function listRecords(table, options) {
  // ... query with filters, pagination
}
```

**API Response Format (ALL responses):**
```json
{ "success": true, "data": {...}, "meta": { "timestamp": "...", "request_id": "..." } }
```

**Paginated Response Format:**
```json
{ "success": true, "data": [...], "pagination": { "total": 100, "limit": 20, "offset": 0, "has_more": true }, "meta": {...} }
```

**Error Response Format:**
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." }, "meta": {...} }
```

**JSON Field Naming:** ALL JSON responses use `snake_case`.

**ESM Imports (Backend ONLY):** All local imports MUST use `.js` extension:
```typescript
import { db } from '../config/database.js';
import { users } from '../db/schema/index.js';
```

### Frontend Patterns

**Component Structure:**
```
src/
├── components/     # Shared UI components
├── hooks/          # Custom hooks (useTable, useExport, useAnalytics)
├── lib/            # API client, utilities
├── pages/          # Page components
├── router.tsx      # Route configuration
├── App.tsx         # Root component
└── main.tsx        # Entry point
```

**TanStack Query Pattern:**
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['admin', 'users', { page, search, filters }],
  queryFn: () => api.get('/admin/users', { params: { limit, offset, search } }),
});
```

**Generic useTable Hook:**
```typescript
function useTable<T>(endpoint: string, config: TableConfig) {
  // Returns: { data, isLoading, pagination, search, filters, sort, create, update, delete }
}
```

---

## Common Gotchas

1. **ESM Imports (Backend)**: All local imports MUST use `.js` extension
2. **Drizzle**: Use `drizzle-orm/pg-core` types; `ilike()` for case-insensitive search
3. **Hono Context**: `c.json()` for responses, `c.req.json()` for request body, `c.req.query()` for query params
4. **Composite PKs**: `watchlistItems`, `filingReads`, `redFlagAcknowledgments` have composite primary keys — no single `id` column
5. **JSONB Fields**: `executives.previousCompanies`, `alertRules.triggerConditions`, `userSettings.settings`
6. **Vite Proxy**: Configure proxy in `vite.config.ts` to forward `/v1` to `http://localhost:3000`
7. **TailwindCSS v4**: Uses `@import "tailwindcss"` in CSS, NOT the v3 `@tailwind` directives
8. **React Router v7**: Uses `createBrowserRouter` and `RouterProvider`
9. **snake_case in API**: Backend returns snake_case JSON. Frontend should use these keys directly or transform.
10. **Admin Secret**: Stored in `sessionStorage.getItem('adminSecret')`, sent as `X-Admin-Secret` header.

---

## Working Directory Rules

- For **backend stories** (OPS-001 to OPS-019): Work in `/Users/manav/Space/code/vettr-backend/`
- For **frontend stories** (OPS-020 to OPS-065): Work in `/Users/manav/Space/code/vettr-ops-dashboard/`
- Commits for backend stories: run in vettr-backend directory
- Commits for frontend stories: run in vettr-ops-dashboard directory
- PRD file is ALWAYS at `/Users/manav/Space/code/vettr-backend/scripts/ralph/prd-ops.json` regardless of story type

---

## Progress Report Format

APPEND to `scripts/ralph/progress-ops.txt` (never replace, always append):

```
## [Story ID]: [Story Title]
Status: COMPLETE
Date: [date]
Working Directory: [backend or frontend path]
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
- Commit frequently with descriptive messages: `feat: OPS-XXX - Title`
- Keep builds green (npm run build must pass)
- Read the Codebase Patterns section in progress-ops.txt before starting
- snake_case for ALL JSON API responses (backend)
- All local imports use .js extension (backend ESM requirement)
- Frontend does NOT need .js extensions (Vite handles it)
- The backend is already running at http://localhost:3000 — do NOT start it
- For frontend dev server: use `npm run dev` if needed for testing
