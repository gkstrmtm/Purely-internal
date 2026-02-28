-- Add auto-topup settings for Ads advertiser accounts

ALTER TABLE "AdsAdvertiserAccount"
  ADD COLUMN IF NOT EXISTS "autoTopUpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoTopUpThresholdCents" INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS "autoTopUpAmountCents" INTEGER NOT NULL DEFAULT 5000;
