import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { users, referrals } from '../db/schema/index.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VETTR-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getDiscountTier(count: number): { tier: string; discount_pct: number } {
  if (count >= 6) return { tier: 'gold', discount_pct: 30 };
  if (count >= 3) return { tier: 'silver', discount_pct: 20 };
  if (count >= 1) return { tier: 'bronze', discount_pct: 10 };
  return { tier: 'none', discount_pct: 0 };
}

/**
 * Get or generate a referral code for a user
 */
export async function getReferralCode(userId: string): Promise<string> {
  if (!db) throw new InternalError('Database not available');

  const [user] = await db.select({ referralCode: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError('User not found');

  if (user.referralCode) return user.referralCode;

  // Generate and store a new code
  const code = generateCode();
  await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
  return code;
}

/**
 * Get referral stats for a user
 */
export async function getReferralStats(userId: string) {
  if (!db) throw new InternalError('Database not available');

  const code = await getReferralCode(userId);

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(eq(referrals.referrerUserId, userId));

  const referralCount = result[0]?.count ?? 0;
  const { tier, discount_pct } = getDiscountTier(referralCount);

  return {
    code,
    referral_count: referralCount,
    discount_pct,
    tier,
  };
}

/**
 * Apply a referral code during signup
 */
export async function applyReferralCode(referredUserId: string, code: string): Promise<boolean> {
  if (!db) throw new InternalError('Database not available');

  // Find the referrer by code
  const [referrer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.referralCode, code.toUpperCase()))
    .limit(1);

  if (!referrer) return false;

  // Don't allow self-referral
  if (referrer.id === referredUserId) return false;

  // Check if already referred
  const existing = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(eq(referrals.referredUserId, referredUserId))
    .limit(1);

  if (existing.length > 0) return false;

  // Create referral record
  await db.insert(referrals).values({
    referrerUserId: referrer.id,
    referredUserId,
    referralCode: code.toUpperCase(),
    status: 'completed',
  });

  return true;
}
