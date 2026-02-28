-- ToS / Privacy Agreement Tracking
-- Adds tos_accepted_at, privacy_accepted_at, tos_version columns to users table.
-- Complies with CASL, PIPEDA, and App Store guideline 3.1.1 (consent tracking).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "tos_accepted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "privacy_accepted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "tos_version" varchar(20);
