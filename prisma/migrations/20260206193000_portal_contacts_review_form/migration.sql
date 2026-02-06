-- Portal contacts + review form answers.

-- Create PortalContact table (idempotent).
CREATE TABLE IF NOT EXISTS "PortalContact" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "email" TEXT,
  "emailKey" TEXT,
  "phone" TEXT,
  "phoneKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalContact_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PortalContact_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalContact"
      ADD CONSTRAINT "PortalContact_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add contactId to PortalBooking + PortalReview.
ALTER TABLE "PortalBooking" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
ALTER TABLE "PortalReview" ADD COLUMN IF NOT EXISTS "contactId" TEXT;

-- Add answersJson to PortalReview.
ALTER TABLE "PortalReview" ADD COLUMN IF NOT EXISTS "answersJson" JSONB;

-- Foreign keys (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBooking_contactId_fkey'
  ) THEN
    ALTER TABLE "PortalBooking"
      ADD CONSTRAINT "PortalBooking_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalReview_contactId_fkey'
  ) THEN
    ALTER TABLE "PortalReview"
      ADD CONSTRAINT "PortalReview_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes (idempotent).
CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_idx" ON "PortalContact"("ownerId");
CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_emailKey_idx" ON "PortalContact"("ownerId", "emailKey");
CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_phoneKey_idx" ON "PortalContact"("ownerId", "phoneKey");
CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_nameKey_idx" ON "PortalContact"("ownerId", "nameKey");

CREATE INDEX IF NOT EXISTS "PortalReview_ownerId_contactId_idx" ON "PortalReview"("ownerId", "contactId");
