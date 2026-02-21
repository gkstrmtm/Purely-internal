-- Create PortalServiceSetup + PortalServiceSetupStatus if missing.
-- Idempotent by design (safe to run repeatedly).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'PortalServiceSetupStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "PortalServiceSetupStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PortalServiceSetup" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "serviceSlug" TEXT NOT NULL,
  "status" "PortalServiceSetupStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "dataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortalServiceSetup_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'PortalServiceSetup_ownerId_serviceSlug_key'
  ) THEN
    CREATE UNIQUE INDEX "PortalServiceSetup_ownerId_serviceSlug_key"
      ON "PortalServiceSetup" ("ownerId", "serviceSlug");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'PortalServiceSetup_ownerId_idx'
  ) THEN
    CREATE INDEX "PortalServiceSetup_ownerId_idx"
      ON "PortalServiceSetup" ("ownerId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PortalServiceSetup_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalServiceSetup"
      ADD CONSTRAINT "PortalServiceSetup_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;
