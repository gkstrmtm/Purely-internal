import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalNurtureSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const statements: string[] = [
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalNurtureCampaignStatus'
  ) THEN
    CREATE TYPE "PortalNurtureCampaignStatus" AS ENUM ('DRAFT','ACTIVE','PAUSED','ARCHIVED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalNurtureStepKind'
  ) THEN
    CREATE TYPE "PortalNurtureStepKind" AS ENUM ('SMS','EMAIL');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalNurtureEnrollmentStatus'
  ) THEN
    CREATE TYPE "PortalNurtureEnrollmentStatus" AS ENUM ('ACTIVE','COMPLETED','STOPPED');
  END IF;
END $$;
    `.trim(),

    `
CREATE TABLE IF NOT EXISTS "PortalNurtureCampaign" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "PortalNurtureCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "audienceTagIdsJson" JSONB,
  "smsFooter" TEXT NOT NULL DEFAULT 'Reply STOP to opt out.',
  "emailFooter" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalNurtureCampaign_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `
CREATE TABLE IF NOT EXISTS "PortalNurtureStep" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "ord" INTEGER NOT NULL,
  "kind" "PortalNurtureStepKind" NOT NULL,
  "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalNurtureStep_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `
CREATE TABLE IF NOT EXISTS "PortalNurtureEnrollment" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "PortalNurtureEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "stepIndex" INTEGER NOT NULL DEFAULT 0,
  "nextSendAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalNurtureEnrollment_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `CREATE INDEX IF NOT EXISTS "PortalNurtureCampaign_ownerId_updatedAt_idx" ON "PortalNurtureCampaign"("ownerId","updatedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalNurtureCampaign_ownerId_status_updatedAt_idx" ON "PortalNurtureCampaign"("ownerId","status","updatedAt");`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalNurtureStep_campaignId_ord_key" ON "PortalNurtureStep"("campaignId","ord");`,
    `CREATE INDEX IF NOT EXISTS "PortalNurtureStep_ownerId_campaignId_idx" ON "PortalNurtureStep"("ownerId","campaignId");`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalNurtureEnrollment_campaignId_contactId_key" ON "PortalNurtureEnrollment"("campaignId","contactId");`,
    `CREATE INDEX IF NOT EXISTS "PortalNurtureEnrollment_ownerId_status_nextSendAt_idx" ON "PortalNurtureEnrollment"("ownerId","status","nextSendAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalNurtureEnrollment_campaignId_status_nextSendAt_idx" ON "PortalNurtureEnrollment"("campaignId","status","nextSendAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalNurtureEnrollment_ownerId_contactId_idx" ON "PortalNurtureEnrollment"("ownerId","contactId");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalNurtureCampaign_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalNurtureCampaign"
      ADD CONSTRAINT "PortalNurtureCampaign_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalNurtureStep_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalNurtureStep"
      ADD CONSTRAINT "PortalNurtureStep_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalNurtureStep_campaignId_fkey'
  ) THEN
    ALTER TABLE "PortalNurtureStep"
      ADD CONSTRAINT "PortalNurtureStep_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "PortalNurtureCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalNurtureEnrollment_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalNurtureEnrollment"
      ADD CONSTRAINT "PortalNurtureEnrollment_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalNurtureEnrollment_campaignId_fkey'
  ) THEN
    ALTER TABLE "PortalNurtureEnrollment"
      ADD CONSTRAINT "PortalNurtureEnrollment_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "PortalNurtureCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PortalContact'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'PortalNurtureEnrollment_contactId_fkey'
    ) THEN
      ALTER TABLE "PortalNurtureEnrollment"
        ADD CONSTRAINT "PortalNurtureEnrollment_contactId_fkey"
        FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}
