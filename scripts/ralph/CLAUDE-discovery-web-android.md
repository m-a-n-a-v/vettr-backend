# VETTR Discovery Page Enhancements (Web + Android) - Ralph Agent Instructions

You are an autonomous coding agent implementing Discovery page enhancements for the VETTR web app (Next.js) and Android app (Kotlin/Compose). The backend is already complete — you only need to implement frontend changes.

## Your Task

1. Read the PRD at `scripts/ralph/discovery-web-android-prd.json`
2. Read the progress log at `scripts/ralph/discovery-web-android-progress.txt`
3. Pick the **highest priority** story where `passes: false`
4. Implement that single story
5. Run quality checks (see below)
6. Commit ALL changes with message: `feat: [Story ID] - [Story Title]`
7. Update the PRD to set `passes: true` for the completed story
8. Append progress to `scripts/ralph/discovery-web-android-progress.txt`

---

## Repo Locations

- **Web App**: `/Users/manav/Space/code/vettr-web`
- **Android App**: `/Users/manav/Space/code/vettr-android`
- **Backend** (read-only reference): `/Users/manav/Space/code/vettr-backend`

---

## Quality Commands

**Web App** (from `/Users/manav/Space/code/vettr-web`):
```bash
npm run build
```

**Android App** (from `/Users/manav/Space/code/vettr-android`):
```bash
./gradlew app:compileDebugKotlin 2>&1 | tail -20
```
If gradle is slow, at minimum verify Kotlin syntax compiles.

All commits MUST pass the relevant build command.

---

## Backend API Reference

The following endpoint is ALREADY LIVE at `https://vettr-backend.vercel.app/v1`:

### GET /discovery/collections
- **Auth**: JWT Bearer token (Authorization header)
- **Response format**:
```json
{
  "success": true,
  "data": {
    "collections": [
      {
        "id": "clean_sheets",
        "name": "The Clean Sheet Collection",
        "tagline": "Score >75, Zero Red Flags. Safety first.",
        "icon": "checkmark.shield",
        "criteria_summary": "Avg Vettr Score: 82  Stocks: 18",
        "stocks": [
          {
            "ticker": "NXE",
            "name": "NexGen Energy Ltd.",
            "exchange": "TSX",
            "sector": "Uranium",
            "market_cap": 5200000000,
            "price": 12.50,
            "price_change": 0.8,
            "vetr_score": 85
          }
        ]
      }
    ]
  }
}
```

### GET /stocks (multi-sector filter)
- `GET /stocks?sector=Gold,Silver,Copper` — returns stocks in any of these sectors
- Backward compatible: single sector still works

### Icon Mapping (SF Symbol → Emoji)
- `checkmark.shield` → ✅
- `banknote` → 💰
- `bolt.fill` → ⚡
- `trophy` → 🏆
- `crown` → 👑
- `person.badge.shield.checkmark` → 🛡️

---

## Codebase Patterns

### Web App (Next.js 14+ App Router + Tailwind + SWR)
- **Framework**: Next.js with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS with custom vettr design tokens
- **Data Fetching**: SWR hooks with typed fetchers
- **API Client**: `src/lib/api-client.ts` — `api.get<T>(url)` with JWT auth
- **Hooks**: `src/hooks/` — one SWR hook per data type (useStocks, useFilings, etc.)
- **Types**: `src/types/api.ts` — centralized TypeScript interfaces
- **Pages**: `src/app/(main)/[page]/page.tsx` with `'use client'` directive
- **Components**: `src/components/ui/` — reusable UI components
- **Design tokens**: `vettr-navy` (bg), `vettr-dark`, `vettr-card`, `vettr-accent` (green)
- **Discovery page**: `src/app/(main)/discovery/page.tsx`
- **Build**: `npm run build` (Next.js build)

### Android App (Kotlin + Jetpack Compose + Hilt + Room)
- **Framework**: Jetpack Compose, Material3, Hilt DI
- **API**: Retrofit with Gson, `VettrApi.kt` interface
- **DTOs**: `core/data/remote/` — Gson SerializedName annotations
- **ViewModels**: `@HiltViewModel` with `MutableStateFlow` state
- **Screens**: Feature-based folders (`feature/discovery/`)
- **Design**: `designsystem/theme/` — VettrAccent, VettrGreen, etc.
- **Components**: `designsystem/component/` — cardStyle(), vettrPadding(), etc.
- **Discovery screen**: `feature/discovery/DiscoveryScreen.kt` + `DiscoveryViewModel.kt`
- **Navigation**: `VettrNavHost.kt` with NavHost + composable destinations
- **Build**: `./gradlew app:compileDebugKotlin`

---

## Key Files Reference

### Web App
- `src/app/(main)/discovery/page.tsx` — Main Discovery page (modify for multi-select + collections)
- `src/hooks/useStocks.ts` — Example SWR hook pattern to follow
- `src/lib/api-client.ts` — API client with JWT auth
- `src/types/api.ts` — TypeScript type definitions
- `src/components/ui/StockCard.tsx` — Stock card component reference
- `src/components/ui/VetrScoreBadge.tsx` — Score badge component

### Android App
- `feature/discovery/DiscoveryScreen.kt` — Main Discovery screen composable
- `feature/discovery/DiscoveryViewModel.kt` — Discovery ViewModel
- `core/data/remote/VettrApi.kt` — Retrofit API interface
- `core/data/remote/StockDto.kt` — Stock DTO (example pattern)
- `core/data/remote/AdminResponse.kt` — Response wrapper DTOs
- `core/data/remote/AuthInterceptor.kt` — JWT auth interceptor
- `designsystem/component/` — Reusable UI components
- `designsystem/theme/` — Theme colors and spacing

---

## Important Notes

- Work on ONE story per iteration
- The story `repo` field tells you which repo to work in
- Commit to the correct repo (cd to repo dir before git operations)
- Web commits go to main branch in vettr-web
- Android commits go to main branch in vettr-android
- Push after each commit
- Keep builds green
- The PRD file lives in the backend repo: `/Users/manav/Space/code/vettr-backend/scripts/ralph/discovery-web-android-prd.json`

---

## Progress Report Format

APPEND to scripts/ralph/discovery-web-android-progress.txt:

```
## [Story ID]: [Story Title]
Status: ✅ COMPLETE
Date: [date]
Repo: [web|android]
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
