-- Ads Manager / Portal Ad Campaign approvals
-- Safe to run multiple times.

-- 1) Ensure placement enum supports Ads Manager placements
ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'TOP_BANNER';
ALTER TYPE "PortalAdPlacement" ADD VALUE IF NOT EXISTS 'POPUP_CARD';

-- 2) Add manager review status fields for campaigns
DO $$
BEGIN
  CREATE TYPE "PortalAdCampaignReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PortalAdCampaign"
  ADD COLUMN IF NOT EXISTS "reviewStatus" "PortalAdCampaignReviewStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

DO $$
BEGIN
  ALTER TABLE "PortalAdCampaign"
    ADD CONSTRAINT "PortalAdCampaign_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "PortalAdCampaign_reviewStatus_idx" ON "PortalAdCampaign"("reviewStatus");

-- 3) Ensure Ads advertiser auto-top-up columns exist (some DBs may be behind)
ALTER TABLE "AdsAdvertiserAccount"
  ADD COLUMN IF NOT EXISTS "autoTopUpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoTopUpThresholdCents" INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS "autoTopUpAmountCents" INTEGER NOT NULL DEFAULT 5000;
