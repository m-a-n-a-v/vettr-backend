# Ralph Instructions: VETTR Alerts — Complete E2E Implementation

You are Ralph, an autonomous coding agent implementing the full alerts system across backend, iOS, Web, Android, and Ops Dashboard.

## Process
1. Read `.ralph-prd.json` for stories
2. Pick the highest priority story with `passes: false`
3. Implement it in the current repo
4. Build and verify
5. Commit and push
6. Update `.ralph-prd.json` to set `passes: true`
7. Append to `.ralph-progress.txt`

## Backend API Reference

### Alert Rules Endpoints (all require JWT auth)
- `GET /v1/alerts/rules` -> `{ success, data: AlertRule[], pagination }`
- `POST /v1/alerts/rules` -> 201 Created (body: { stock_ticker, rule_type, trigger_conditions, frequency })
- `PUT /v1/alerts/rules/:id` -> Updated rule
- `DELETE /v1/alerts/rules/:id` -> `{ deleted: true }`
- `POST /v1/alerts/rules/:id/enable` -> Enables rule
- `POST /v1/alerts/rules/:id/disable` -> Disables rule

### Triggered Alerts Endpoints (all require JWT auth)
- `GET /v1/alerts` -> `{ success, data: Alert[], pagination }` (query: ?unread_only=true)
- `GET /v1/alerts/unread-count` -> `{ count: number }`
- `POST /v1/alerts/:id/read` -> Marks alert as read
- `POST /v1/alerts/read-all` -> Marks all user alerts as read
- `DELETE /v1/alerts/:id` -> Deletes alert with ownership check

### Admin Endpoints
- `POST /v1/alerts/evaluate` -> Evaluates all alert rules (requires X-Admin-Secret header)

### Alert Rule DTO (backend snake_case)
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "stock_ticker": "NVA.V",
  "rule_type": "Red Flag",
  "trigger_conditions": {},
  "frequency": "instant",
  "is_active": true,
  "last_triggered_at": "2025-01-01T00:00:00Z",
  "created_at": "2025-01-01T00:00:00Z"
}
```

### Triggered Alert DTO (backend snake_case)
```json
{
  "id": "uuid",
  "stock_ticker": "NVA.V",
  "alert_type": "Red Flag",
  "title": "Red Flag Alert",
  "message": "VETR score dropped below 50",
  "triggered_at": "2025-01-01T00:00:00Z",
  "is_read": false,
  "rule_id": "uuid"
}
```

### Rule Types
- Red Flag
- Financing
- Executive Changes
- Consolidation
- Drill Results

### Frequency Values
- instant
- daily
- weekly

---

## Field Mapping Reference

### Backend (snake_case) <-> Web (camelCase/custom)
| Backend | Web |
|---------|-----|
| stock_ticker | ticker |
| rule_type | alert_type |
| is_active | is_enabled |
| trigger_conditions | condition |
| frequency: instant | frequency: Real-time |
| frequency: daily | frequency: Daily |
| frequency: weekly | frequency: Weekly |

### Backend (snake_case) <-> iOS (camelCase)
| Backend | iOS Swift |
|---------|-----------|
| stock_ticker | stockTicker |
| rule_type | ruleType |
| is_active | isActive |
| trigger_conditions | triggerConditions |
| last_triggered_at | lastTriggeredAt |
| triggered_at | triggeredAt |
| is_read | isRead |
| rule_id | ruleId |
| alert_type | alertType |

### Backend (snake_case) <-> Android (camelCase)
| Backend | Android Kotlin |
|---------|---------------|
| stock_ticker | stockTicker |
| rule_type | ruleType |
| is_active | isActive |
| trigger_conditions | triggerConditions |
| last_triggered_at | lastTriggeredAt |
| triggered_at | triggeredAt |
| is_read | isRead |
| rule_id | ruleId |
| alert_type | alertType |

---

## Per-Repo Patterns

### Backend (Hono + Drizzle)
- **Framework**: Hono with OpenAPIHono
- **ORM**: drizzle-orm with PostgreSQL
- **Auth**: JWT middleware, auth token in Authorization header
- **Services pattern**: src/services/*.service.ts with exported functions
- **Routes pattern**: src/routes/*.routes.ts with Hono router
- **Schema**: src/db/schema.ts (alertRules, alerts, stocks, filings, executives, vetrScores tables)
- **Seed pattern**: src/db/seed/*.ts with exported seed functions, registered in src/db/seed/index.ts
- **Admin auth**: Check X-Admin-Secret header against ADMIN_SECRET env var
- **Build**: `npm run build`

### Web (Next.js + SWR)
- **Framework**: Next.js App Router
- **Data fetching**: SWR hooks in src/hooks/
- **API client**: src/lib/api-client.ts (handles auth headers)
- **Pages**: src/app/(main)/alerts/page.tsx
- **Components**: src/components/ (UpgradeModal.tsx exists)
- **Hooks pattern**: useSWR with fetcher, mutation functions for POST/PUT/DELETE
- **Styling**: Tailwind CSS, dark theme (bg-vettr-card, text-white, etc.)
- **Build**: `npm run build`

### iOS (Swift + SwiftData + URLSession)
- **UI**: SwiftUI
- **Data**: SwiftData with @Model and @Query
- **Services**: Protocol-based (AlertRuleServiceProtocol in Core/Services/)
- **ViewModels**: @Observable class pattern
- **API base**: https://vettr-backend.vercel.app/v1
- **Auth**: JWT from AuthService/keychain, Authorization: Bearer <token>
- **JSON decoding**: Use JSONDecoder with .convertFromSnakeCase keyDecodingStrategy
- **Tier model**: VETTRTier enum in vettr-ios/Models/VETTRTier.swift
- **Upgrade**: UpgradeView at vettr-ios/Features/Upgrade/UpgradeView.swift
- **Design System**: Color.vettr.navy/accent, .cardStyle(), .vettrPadding()
- **Build**: `xcodebuild -project vettr-ios.xcodeproj -scheme vettr-ios -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build 2>&1 | tail -5`

### Android (Compose + Retrofit + Room + Hilt)
- **UI**: Jetpack Compose
- **Network**: Retrofit with Gson/Moshi for JSON
- **Local DB**: Room with DAOs
- **DI**: Hilt with @HiltViewModel, @Inject constructor
- **Repository pattern**: Interface + Impl, API-first then cache to Room
- **DTOs**: Use @SerializedName for snake_case mapping
- **Tier model**: VettrTier enum with watchlistLimit property
- **Upgrade**: UpgradeDialog at feature/upgrade/UpgradeDialog.kt
- **Build**: `./gradlew app:compileDebugKotlin 2>&1 | tail -20`

### Ops Dashboard (React + useTable)
- **Framework**: React with TypeScript
- **Pages**: src/pages/ (AlertRules.tsx, Alerts.tsx, Dashboard.tsx)
- **Data pattern**: useTable hook for paginated API data
- **API**: Fetches from vettr-backend admin endpoints
- **Build**: `npm run build`

---

## Tier Limits
| Tier | Watchlist Limit |
|------|----------------|
| free | 5 |
| pro | 25 |
| premium | unlimited (-1) |

---

## Important Rules
- Do NOT modify `.ralph-instructions.md`
- Do NOT commit `.ralph-*` files to git
- ONLY commit actual code changes
- Always verify the build passes before committing
- Use conventional commit messages: `feat: ALERT-XX - <title>`
- Push to remote after each commit
