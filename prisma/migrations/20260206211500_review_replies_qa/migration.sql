-- Business replies on reviews + public Q&A.

-- Add business reply fields to PortalReview.
ALTER TABLE "PortalReview" ADD COLUMN IF NOT EXISTS "businessReply" TEXT;
ALTER TABLE "PortalReview" ADD COLUMN IF NOT EXISTS "businessReplyAt" TIMESTAMP(3);

-- Create PortalReviewQuestion table (idempotent).
CREATE TABLE IF NOT EXISTS "PortalReviewQuestion" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "answeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalReviewQuestion_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PortalReviewQuestion_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalReviewQuestion"
      ADD CONSTRAINT "PortalReviewQuestion_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes (idempotent).
CREATE INDEX IF NOT EXISTS "PortalReviewQuestion_ownerId_createdAt_idx" ON "PortalReviewQuestion"("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PortalReviewQuestion_ownerId_answeredAt_idx" ON "PortalReviewQuestion"("ownerId", "answeredAt");
