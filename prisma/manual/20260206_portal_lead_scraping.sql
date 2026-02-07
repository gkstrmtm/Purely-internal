-- Targeted, idempotent schema patch for Lead Scraping (2026-02-06)
-- Applies the same changes as prisma/migrations/20260206130000_portal_lead_scraping/migration.sql

DO $$
BEGIN
  CREATE TYPE "PortalLeadScrapeKind" AS ENUM ('B2B', 'B2C');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PortalLeadSource" AS ENUM ('GOOGLE_PLACES');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PortalLeadScrapeRun" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" "PortalLeadScrapeKind" NOT NULL,
  "requestedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "chargedCredits" INTEGER NOT NULL DEFAULT 0,
  "refundedCredits" INTEGER NOT NULL DEFAULT 0,
  "settingsJson" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalLeadScrapeRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PortalLead" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "source" "PortalLeadSource" NOT NULL DEFAULT 'GOOGLE_PLACES',
  "kind" "PortalLeadScrapeKind" NOT NULL DEFAULT 'B2B',
  "businessName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "address" TEXT,
  "niche" TEXT,
  "starred" BOOLEAN NOT NULL DEFAULT FALSE,
  "tag" TEXT,
  "tagColor" TEXT,
  "placeId" TEXT,
  "dataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalLead_pkey" PRIMARY KEY ("id")
);

ALTER TABLE IF EXISTS "PortalLead"
  ADD COLUMN IF NOT EXISTS "email" TEXT;

ALTER TABLE IF EXISTS "PortalLead"
  ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS "PortalLead"
  ADD COLUMN IF NOT EXISTS "tag" TEXT;

ALTER TABLE IF EXISTS "PortalLead"
  ADD COLUMN IF NOT EXISTS "tagColor" TEXT;

CREATE INDEX IF NOT EXISTS "PortalLeadScrapeRun_ownerId_createdAt_idx"
  ON "PortalLeadScrapeRun" ("ownerId", "createdAt");

CREATE INDEX IF NOT EXISTS "PortalLeadScrapeRun_ownerId_kind_createdAt_idx"
  ON "PortalLeadScrapeRun" ("ownerId", "kind", "createdAt");

CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_createdAt_idx"
  ON "PortalLead" ("ownerId", "createdAt");

CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_kind_createdAt_idx"
  ON "PortalLead" ("ownerId", "kind", "createdAt");

CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_starred_createdAt_idx"
  ON "PortalLead" ("ownerId", "starred", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "PortalLead_ownerId_placeId_key"
  ON "PortalLead" ("ownerId", "placeId");

CREATE UNIQUE INDEX IF NOT EXISTS "PortalLead_ownerId_phone_key"
  ON "PortalLead" ("ownerId", "phone");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalLeadScrapeRun_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalLeadScrapeRun"
      ADD CONSTRAINT "PortalLeadScrapeRun_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalLead_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalLead"
      ADD CONSTRAINT "PortalLead_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
