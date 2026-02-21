-- Credit reports: imports + item audit/dispute tracking (idempotent)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreditReportAuditTag') THEN
    CREATE TYPE "CreditReportAuditTag" AS ENUM ('PENDING', 'NEGATIVE', 'POSITIVE');
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CreditReport" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "contactId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'UPLOAD',
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreditReportItem" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "bureau" TEXT,
  "kind" TEXT,
  "label" TEXT NOT NULL,
  "detailsJson" JSONB,
  "auditTag" "CreditReportAuditTag" NOT NULL DEFAULT 'PENDING',
  "disputeStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditReportItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditReport_ownerId_fkey') THEN
    ALTER TABLE "CreditReport"
      ADD CONSTRAINT "CreditReport_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditReport_contactId_fkey') THEN
    ALTER TABLE "CreditReport"
      ADD CONSTRAINT "CreditReport_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditReportItem_reportId_fkey') THEN
    ALTER TABLE "CreditReportItem"
      ADD CONSTRAINT "CreditReportItem_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "CreditReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CreditReport_ownerId_importedAt_idx" ON "CreditReport"("ownerId", "importedAt");
CREATE INDEX IF NOT EXISTS "CreditReport_ownerId_contactId_importedAt_idx" ON "CreditReport"("ownerId", "contactId", "importedAt");
CREATE INDEX IF NOT EXISTS "CreditReport_contactId_importedAt_idx" ON "CreditReport"("contactId", "importedAt");

CREATE INDEX IF NOT EXISTS "CreditReportItem_reportId_idx" ON "CreditReportItem"("reportId");
CREATE INDEX IF NOT EXISTS "CreditReportItem_reportId_auditTag_idx" ON "CreditReportItem"("reportId", "auditTag");
