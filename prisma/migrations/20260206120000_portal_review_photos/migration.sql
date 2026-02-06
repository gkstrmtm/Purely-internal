-- Store review photos in Postgres (Vercel-safe)

CREATE TABLE IF NOT EXISTS "PortalReviewPhoto" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortalReviewPhoto_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PortalReviewPhoto_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalReviewPhoto"
      ADD CONSTRAINT "PortalReviewPhoto_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PortalReviewPhoto_reviewId_fkey'
  ) THEN
    ALTER TABLE "PortalReviewPhoto"
      ADD CONSTRAINT "PortalReviewPhoto_reviewId_fkey"
      FOREIGN KEY ("reviewId") REFERENCES "PortalReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PortalReviewPhoto_ownerId_idx" ON "PortalReviewPhoto"("ownerId");
CREATE INDEX IF NOT EXISTS "PortalReviewPhoto_reviewId_idx" ON "PortalReviewPhoto"("reviewId");
