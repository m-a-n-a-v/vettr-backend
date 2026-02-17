# Ralph Instructions: Pulse Profile-Based + Watchlist Management

You are Ralph, an autonomous coding agent implementing profile-based Pulse page changes and watchlist management across iOS, Web, and Android.

## Process
1. Read `.ralph-prd.json` for stories
2. Pick the highest priority story with `passes: false`
3. Implement it in the current repo
4. Build and verify
5. Commit and push
6. Update `.ralph-prd.json` to set `passes: true`
7. Append to `.ralph-progress.txt`

## Backend API Reference

### Watchlist Endpoints (all require JWT auth)
- `GET /v1/watchlist` → `{ success, data: Stock[], pagination }`
- `POST /v1/watchlist/:ticker` → 201 Created (returns stock)
- `DELETE /v1/watchlist/:ticker` → 200 `{ deleted: true }`
- Error: `TIER_LIMIT_EXCEEDED` (403) when adding above limit

### Subscription Endpoint
- `GET /v1/subscription` → `{ tier, limits: { watchlist: 5|25|-1, ... } }`

### Tier Limits
| Tier | Watchlist Limit |
|------|----------------|
| free | 5 |
| pro | 25 |
| premium | unlimited (-1) |

### Stock Detail
- `GET /v1/stocks/:ticker` → includes `is_favorite: boolean`

### Admin Endpoints (used by iOS/Android for data fetch)
- `GET /v1/admin/stocks?limit=100` with `X-Admin-Secret` header

---

## iOS Codebase Patterns

### Key Files
- **PulseView.swift**: `vettr-ios/Features/Pulse/Views/PulseView.swift`
- **StocksView.swift**: `vettr-ios/Features/Stocks/Views/StocksView.swift`
- **StocksViewModel.swift**: `vettr-ios/Features/Stocks/ViewModels/StocksViewModel.swift`
- **StockDetailView.swift**: `vettr-ios/Features/StockDetail/Views/StockDetailView.swift`
- **Stock.swift**: `vettr-ios/Models/Stock.swift` (SwiftData @Model, has `isFavorite: Bool`)
- **Filing.swift**: `vettr-ios/Models/Filing.swift` (has `stockId: UUID`)
- **VETTRTier.swift**: `vettr-ios/Models/VETTRTier.swift` (enum with `watchlistLimit: Int?`)
- **EmptyStateView.swift**: `vettr-ios/DesignSystem/Components/EmptyStateView.swift`
- **SectionHeaderView.swift**: `vettr-ios/DesignSystem/Components/SectionHeaderView.swift`
- **MetricCard.swift**: `vettr-ios/DesignSystem/Components/MetricCard.swift`
- **Colors.swift**: `vettr-ios/DesignSystem/Colors.swift` (Color.vettr.navy, .accent, .textPrimary, etc.)

### SwiftData Query Pattern
```swift
// Current (all stocks)
@Query(sort: \Stock.vetrScore, order: .reverse) private var stocks: [Stock]

// Filter to watchlist only - use #Predicate
@Query(filter: #Predicate<Stock> { $0.isFavorite == true }, sort: \Stock.vetrScore, order: .reverse)
private var watchlistStocks: [Stock]
```

### Empty State Pattern
```swift
EmptyStateView(
    icon: "star.circle",
    title: "Your Watchlist is Empty",
    subtitle: "Add stocks to your watchlist to see personalized insights"
)
```

### Navigation
- Uses NavigationStack with navigationDestination(for:)
- Tab switching via environment or binding
- SectionHeaderView already has `showSeeAll: Bool` parameter

### VETTRTier
```swift
enum VETTRTier: String, Codable {
    case free, pro, premium
    var watchlistLimit: Int? {
        switch self {
        case .free: return 5
        case .pro: return 25
        case .premium: return nil // unlimited
        }
    }
}
```

### Design System
- Spacing: `Spacing.xs/sm/md/lg/xl`
- Typography: `Typography.title/headline/body/caption`
- Colors: `Color.vettr.navy/accent/textPrimary/textSecondary/cardBackground`
- `.cardStyle()` modifier for card backgrounds
- `.vettrPadding()` for standard padding

### Build Command
```bash
xcodebuild -project vettr-ios.xcodeproj -scheme vettr-ios -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build 2>&1 | tail -5
```

---

## Web Codebase Patterns

### Key Files
- **Pulse page**: `src/app/(main)/pulse/page.tsx`
- **Stocks page**: `src/app/(main)/stocks/page.tsx`
- **useWatchlist**: `src/hooks/useWatchlist.ts`
- **useStocks**: `src/hooks/useStocks.ts`
- **useSubscription**: `src/hooks/useSubscription.ts`
- **useFilings**: `src/hooks/useFilings.ts`
- **useRedFlagTrend**: `src/hooks/useRedFlagTrend.ts`
- **API client**: `src/lib/api-client.ts`
- **Types**: `src/types/api.ts`
- **EmptyState**: `src/components/ui/EmptyState.tsx`
- **StockCard**: `src/components/ui/StockCard.tsx`
- **Icons**: `src/components/icons/index.tsx`

### useWatchlist Hook
```typescript
const {
  watchlist,           // Stock[]
  isLoading,
  addToWatchlist,      // (ticker: string) => Promise<void>
  removeFromWatchlist, // (ticker: string) => Promise<void>
  isInWatchlist,       // (ticker: string) => boolean
  isAdding, isRemoving
} = useWatchlist()
```

### useSubscription Hook
```typescript
const { subscription, isLoading } = useSubscription()
// subscription.tier: 'free' | 'pro' | 'premium'
// subscription.watchlist_limit: number (-1 = unlimited)
// subscription.stocks_tracked_count: number
```

### Empty State Pattern
```tsx
<EmptyState
  icon={<StarIcon className="w-16 h-16 text-gray-600" />}
  title="Your Watchlist is Empty"
  description="Add stocks to your watchlist to see personalized insights."
  actionLabel="Browse Stocks"
  onAction={() => router.push('/stocks')}
/>
```

### Link Navigation
```tsx
import Link from 'next/link'
<Link href="/stocks?sort=vetr_score&order=desc" className="text-sm text-vettr-accent hover:underline">
  View All
</Link>
```

### Toast Pattern
```typescript
const { showToast } = useToast()
showToast('Watchlist full. Upgrade your plan for more.', 'error')
```

### Styling
- Dark theme: `bg-vettr-card/50 border border-white/5 rounded-2xl p-5`
- Text: `text-white`, `text-gray-400`, `text-gray-500`
- Accent: `text-vettr-accent`
- Cards: `hover:border-vettr-accent/20 hover:bg-vettr-card/80 transition-all`

### Build Command
```bash
npm run build
```

---

## Android Codebase Patterns

### Key Files
- **PulseScreen.kt**: `app/src/main/java/com/vettr/android/feature/pulse/PulseScreen.kt`
- **PulseViewModel.kt**: `app/src/main/java/com/vettr/android/feature/pulse/PulseViewModel.kt`
- **StocksScreen.kt**: `app/src/main/java/com/vettr/android/feature/stockdetail/StocksScreen.kt`
- **StocksViewModel.kt**: `app/src/main/java/com/vettr/android/feature/stockdetail/StocksViewModel.kt`
- **StockDetailViewModel.kt**: `app/src/main/java/com/vettr/android/feature/stockdetail/StockDetailViewModel.kt`
- **StockRepository.kt**: `app/src/main/java/com/vettr/android/core/data/repository/StockRepository.kt`
- **StockDao.kt**: `app/src/main/java/com/vettr/android/core/data/local/StockDao.kt`
- **Stock.kt**: `app/src/main/java/com/vettr/android/core/model/Stock.kt` (Room @Entity, `isFavorite: Boolean`)
- **VettrTier.kt**: `app/src/main/java/com/vettr/android/core/model/VettrTier.kt`
- **EmptyStateView.kt**: `app/src/main/java/com/vettr/android/designsystem/component/EmptyStateView.kt`
- **MainScreen.kt**: `app/src/main/java/com/vettr/android/feature/main/MainScreen.kt`
- **VettrNavHost.kt**: `app/src/main/java/com/vettr/android/feature/main/VettrNavHost.kt`

### StockRepository Interface
```kotlin
interface StockRepository {
    fun getStocks(): Flow<List<Stock>>
    fun getFavorites(): Flow<List<Stock>>  // Already exists!
    suspend fun toggleFavorite(stockId: String)
    // ...
}
```

### StockDao
```kotlin
@Query("SELECT * FROM stocks WHERE is_favorite = 1 ORDER BY vetr_score DESC")
fun getFavorites(): Flow<List<Stock>>

@Query("UPDATE stocks SET is_favorite = NOT is_favorite WHERE id = :stockId")
suspend fun toggleFavorite(stockId: String)
```

### VettrTier Enum
```kotlin
enum class VettrTier {
    FREE, PRO, PREMIUM;
    val watchlistLimit: Int get() = when (this) {
        FREE -> 5; PRO -> 25; PREMIUM -> Int.MAX_VALUE
    }
}
```

### EmptyStateView Pattern
```kotlin
EmptyStateView(
    icon = Icons.Default.Star,
    title = "Your Watchlist is Empty",
    subtitle = "Add stocks to your watchlist to see personalized insights",
    actionLabel = "Browse Stocks",
    onAction = { /* navigate */ }
)
```

### Compose Theme Colors
```kotlin
VettrGreen, VettrRed, VettrYellow, VettrAccent
MaterialTheme.colorScheme.surface/onSurface/onSurfaceVariant
```

### Design System Components
- `cardStyle()` modifier
- `vettrPadding()` modifier
- `SectionHeader(title = "...")`
- `MetricCard(title, value, change, modifier)`
- `Spacing.xs/sm/md/lg`

### Hilt DI Pattern
```kotlin
@HiltViewModel
class PulseViewModel @Inject constructor(
    private val stockRepository: StockRepository,
    private val filingRepository: FilingRepository,
    // ...
) : ViewModel()
```

### Navigation (NavHost)
```kotlin
// In VettrNavHost.kt - composable destinations
composable("stocks") { StocksScreen(...) }
composable("stockDetail/{stockId}") { StockDetailScreen(...) }
```

### Build Command
```bash
./gradlew app:compileDebugKotlin 2>&1 | tail -20
```

---

## Important Rules
- Do NOT modify `.ralph-instructions.md`
- Do NOT commit `.ralph-*` files to git
- ONLY commit actual code changes
- Always verify the build passes before committing
- Use conventional commit messages: `feat: PULSE-XX - <title>`
- Push to remote after each commit
