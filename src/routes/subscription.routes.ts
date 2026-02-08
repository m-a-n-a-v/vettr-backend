import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { success } from '../utils/response.js';

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

// GET /subscription - Return current user's tier and associated limits
subscriptionRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tier = user.tier.toLowerCase();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS['free'];

  return c.json(success({
    tier: user.tier,
    limits,
  }), 200);
});

export { subscriptionRoutes };
