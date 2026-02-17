import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { success } from '../utils/response.js';
import { db } from '../config/database.js';
import { watchlistItems } from '../db/schema/index.js';

type Variables = {
  user: AuthUser;
};

const subscriptionRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all subscription routes
subscriptionRoutes.use('*', authMiddleware);

// Tier limit definitions
const TIER_LIMITS: Record<string, { watchlist: number; sync_interval_hours: number; pulse_delay_hours: number; alert_rules_max: number }> = {
  free: {
    watchlist: 5,
    sync_interval_hours: 24,
    pulse_delay_hours: 12,
    alert_rules_max: 50,
  },
  pro: {
    watchlist: 25,
    sync_interval_hours: 12,
    pulse_delay_hours: 4,
    alert_rules_max: 50,
  },
  premium: {
    watchlist: -1, // unlimited
    sync_interval_hours: 4,
    pulse_delay_hours: 0, // real-time
    alert_rules_max: 50,
  },
};

// Feature lists per tier
const TIER_FEATURES: Record<string, string[]> = {
  free: ['basic_analytics', 'watchlist', 'alerts'],
  pro: ['basic_analytics', 'watchlist', 'alerts', 'advanced_analytics', 'priority_sync'],
  premium: ['basic_analytics', 'watchlist', 'alerts', 'advanced_analytics', 'priority_sync', 'real_time_data', 'unlimited_watchlist'],
};

// GET /subscription - Return current user's tier and associated limits
subscriptionRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tier = user.tier.toLowerCase();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS['free'];
  const features = TIER_FEATURES[tier] || TIER_FEATURES['free'];

  // Count user's current watchlist items
  let stocksTrackedCount = 0;
  try {
    if (db) {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(watchlistItems)
        .where(eq(watchlistItems.userId, user.id));
      stocksTrackedCount = countResult[0]?.count ?? 0;
    }
  } catch {
    // If count fails, default to 0
  }

  return c.json(success({
    tier: user.tier,
    watchlist_limit: limits.watchlist,
    stocks_tracked_count: stocksTrackedCount,
    features,
    limits, // keep nested for backward compatibility
  }), 200);
});

export { subscriptionRoutes };
