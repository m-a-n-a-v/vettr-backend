-- Add referral_code column to users table
ALTER TABLE "users" ADD COLUMN "referral_code" varchar(20) UNIQUE;

-- Create referrals table
CREATE TABLE IF NOT EXISTS "referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referrer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "referred_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "referral_code" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'completed',
  "discount_applied" varchar(10),
  "created_at" timestamp NOT NULL DEFAULT now()
);
