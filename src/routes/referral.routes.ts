import { Hono } from 'hono';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';
import { getReferralStats } from '../services/referral.service.js';
import { success } from '../utils/response.js';

const referralRoutes = new Hono();

referralRoutes.use('*', authMiddleware);

// GET /referrals/me - Get current user's referral code + stats
referralRoutes.get('/me', async (c) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (c as any).get('user') as AuthUser;
  const stats = await getReferralStats(user.id);
  return c.json(success(stats), 200);
});

export { referralRoutes };
