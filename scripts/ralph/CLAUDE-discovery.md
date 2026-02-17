# VETTR Discovery Page Enhancements - Ralph Agent Instructions

You are an autonomous coding agent implementing Discovery page enhancements across 3 VETTR repos: backend API, iOS app, and ops dashboard.

## Your Task

1. Read the PRD at `scripts/ralph/discovery-prd.json`
2. Read the progress log at `scripts/ralph/discovery-progress.txt`
3. Pick the **highest priority** story where `passes: false`
4. Implement that single story
5. Run quality checks (see below)
6. Commit ALL changes with message: `feat: [Story ID] - [Story Title]`
7. Update the PRD to set `passes: true` for the completed story
8. Append progress to `scripts/ralph/discovery-progress.txt`

---

## Repo Locations

- **Backend**: `/Users/manav/Space/code/vettr-backend`
- **iOS**: `/Users/manav/.claude-worktrees/vettr-ios/charming-lichterman`
- **Ops Dashboard**: `/Users/manav/Space/code/vettr-ops-dashboard`

---

## Quality Commands

**Backend** (from `/Users/manav/Space/code/vettr-backend`):
```bash
npm run build
```

**iOS** (from `/Users/manav/.claude-worktrees/vettr-ios/charming-lichterman`):
```bash
xcodebuild -project vettr-ios.xcodeproj -scheme vettr-ios -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build 2>&1 | tail -5
```
If xcodebuild is slow or unavailable, at minimum verify Swift syntax by checking no obvious errors.

**Ops Dashboard** (from `/Users/manav/Space/code/vettr-ops-dashboard`):
```bash
npm run build
```

All commits MUST pass the relevant build command.

---

## Codebase Patterns

### Backend (Hono + Drizzle + TypeScript)
- ESM imports: ALL local imports use `.js` extension (e.g., `'./app.js'` not `'./app'`)
- Routes: `Hono` instances, mount on main app in `src/routes/index.ts`
- Services: plain functions, accept db instance
- JSON: ALL response fields use `snake_case`
- Auth: JWT middleware via `authMiddleware` from `../middleware/auth.js`
- Cache: Redis via `cacheService` from `../services/cache.service.js`
- Responses: `{ success: true, data: {...}, meta: { timestamp, request_id } }`
- DB: Drizzle ORM with `pgTable`, `uuid`, `varchar`, `timestamp`

### iOS (SwiftUI + SwiftData)
- Design system: `Color.vettr.*`, `Typography.*`, `Spacing.*` tokens
- Discovery page: `vettr-ios/Features/Discovery/Views/DiscoveryView.swift`
- API client: `APIClient()` with `.retry()` method
- Endpoints: enum cases conforming to `Endpoint` protocol (path, method, headers, body)
- Auth: JWT stored in Keychain, added by APIClient automatically
- Admin endpoints use `X-Admin-Secret` header; user endpoints use `Authorization: Bearer <jwt>`
- Models: SwiftData `@Model` classes for persisted data, plain structs for transient API data

### Ops Dashboard (React + TypeScript + Vite)
- API calls via `apiGet<T>('/admin/endpoint')` from `src/lib/api.ts`
- Dashboard: `src/pages/Dashboard.tsx`
- Hooks: `src/hooks/useAnalytics.ts` for data fetching with React Query
- Components: Recharts for charts, TailwindCSS for styling

---

## Key Schema Reference

**stocks**: id, ticker, name, exchange, sector, market_cap, price, price_change, vetr_score
**financial_data**: stock_id (FK), cash, monthly_burn, total_debt, total_assets, insider_shares, total_shares, ...
**vetr_score_history**: stock_ticker, overall_score, pedigree_sub_score, insider_alignment_score, ...
**red_flag_history**: stock_ticker, flag_type, severity, score, detected_at

---

## Important Notes

- Work on ONE story per iteration
- The story `repo` field tells you which repo to work in
- Commit to the correct repo (cd to repo dir before git operations)
- Backend commits go to main branch in vettr-backend
- iOS commits go to the current branch (claude/charming-lichterman) in vettr-ios worktree
- Ops commits go to main branch in vettr-ops-dashboard
- Push after each commit
- Keep builds green

---

## Progress Report Format

APPEND to scripts/ralph/discovery-progress.txt:

```
## [Story ID]: [Story Title]
Status: ✅ COMPLETE
Date: [date]
Repo: [backend|ios|ops]
Details:
- What was implemented
- Files changed
---
```

---

## Stop Condition

After completing a story, check if ALL stories have `passes: true`.
If ALL complete, reply with: `<promise>COMPLETE</promise>`
Otherwise, end normally for the next iteration.
