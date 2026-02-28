-- Add Clerk user ID column to support Clerk authentication.
-- clerk_id is nullable initially to avoid breaking existing rows during migration.
-- Once all users are migrated to Clerk, this can be made NOT NULL.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "clerk_id" varchar(255) UNIQUE;
