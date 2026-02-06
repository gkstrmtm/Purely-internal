-- Portal reviews (hosted reviews page submissions)

CREATE TABLE IF NOT EXISTS "PortalReview" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "body" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "photoUrls" JSONB,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortalReview_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PortalReview" ADD CONSTRAINT IF NOT EXISTS "PortalReview_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PortalReview_ownerId_archivedAt_createdAt_idx" ON "PortalReview"("ownerId", "archivedAt", "createdAt");
