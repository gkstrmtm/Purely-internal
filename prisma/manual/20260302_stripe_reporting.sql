-- Adds encrypted Stripe credential fields to the portal account owner (User).
-- Idempotent and safe to re-run.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyCiphertext" TEXT;
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyIv" TEXT;
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyAuthTag" TEXT;
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyPrefix" TEXT;
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT;
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeConnectedAt" TIMESTAMP(3);
