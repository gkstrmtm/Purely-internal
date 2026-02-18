import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalAiOutboundCallsSchema(): Promise<void> {
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
    WHERE n.nspname = 'public' AND t.typname = 'PortalAiOutboundCallCampaignStatus'
  ) THEN
    CREATE TYPE "PortalAiOutboundCallCampaignStatus" AS ENUM ('DRAFT','ACTIVE','PAUSED','ARCHIVED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalAiOutboundCallEnrollmentStatus'
  ) THEN
    CREATE TYPE "PortalAiOutboundCallEnrollmentStatus" AS ENUM ('QUEUED','CALLING','COMPLETED','FAILED','SKIPPED');
  END IF;
END $$;
    `.trim(),

    `
CREATE TABLE IF NOT EXISTS "PortalAiOutboundCallCampaign" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "PortalAiOutboundCallCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "audienceTagIdsJson" JSONB,
  "script" TEXT NOT NULL DEFAULT 'Hi, this is an automated call. Please call us back when you have a moment.',
  "voiceAgentId" TEXT,
  "voiceAgentConfigJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalAiOutboundCallCampaign_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "voiceAgentId" TEXT;
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "voiceAgentConfigJson" JSONB;
    `.trim(),

    `
CREATE TABLE IF NOT EXISTS "PortalAiOutboundCallEnrollment" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "PortalAiOutboundCallEnrollmentStatus" NOT NULL DEFAULT 'QUEUED',
  "nextCallAt" TIMESTAMP(3),
  "callSid" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalAiOutboundCallEnrollment_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallCampaign_ownerId_updatedAt_idx" ON "PortalAiOutboundCallCampaign"("ownerId","updatedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallCampaign_ownerId_status_updatedAt_idx" ON "PortalAiOutboundCallCampaign"("ownerId","status","updatedAt");`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_campaignId_contactId_key" ON "PortalAiOutboundCallEnrollment"("campaignId","contactId");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_ownerId_status_nextCallAt_idx" ON "PortalAiOutboundCallEnrollment"("ownerId","status","nextCallAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_campaignId_status_nextCallAt_idx" ON "PortalAiOutboundCallEnrollment"("campaignId","status","nextCallAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_ownerId_contactId_idx" ON "PortalAiOutboundCallEnrollment"("ownerId","contactId");`,

    `
CREATE TABLE IF NOT EXISTS "PortalAiOutboundCallManualCall" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "campaignId" TEXT,
  "webhookToken" TEXT NOT NULL,
  "toNumberE164" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CALLING',
  "callSid" TEXT,
  "conversationId" TEXT,
  "recordingSid" TEXT,
  "recordingDurationSec" INTEGER,
  "transcriptText" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalAiOutboundCallManualCall_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallManualCall"
  ADD COLUMN IF NOT EXISTS "recordingDurationSec" INTEGER;
    `.trim(),

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalAiOutboundCallManualCall_webhookToken_key" ON "PortalAiOutboundCallManualCall"("webhookToken");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallManualCall_ownerId_createdAt_idx" ON "PortalAiOutboundCallManualCall"("ownerId","createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallManualCall_ownerId_campaignId_createdAt_idx" ON "PortalAiOutboundCallManualCall"("ownerId","campaignId","createdAt");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundCallCampaign_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundCallCampaign"
      ADD CONSTRAINT "PortalAiOutboundCallCampaign_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundCallEnrollment_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundCallEnrollment"
      ADD CONSTRAINT "PortalAiOutboundCallEnrollment_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundCallEnrollment_campaignId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundCallEnrollment"
      ADD CONSTRAINT "PortalAiOutboundCallEnrollment_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "PortalAiOutboundCallCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PortalContact'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundCallEnrollment_contactId_fkey'
    ) THEN
      ALTER TABLE "PortalAiOutboundCallEnrollment"
        ADD CONSTRAINT "PortalAiOutboundCallEnrollment_contactId_fkey"
        FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundCallManualCall_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundCallManualCall"
      ADD CONSTRAINT "PortalAiOutboundCallManualCall_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundCallManualCall_campaignId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundCallManualCall"
      ADD CONSTRAINT "PortalAiOutboundCallManualCall_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "PortalAiOutboundCallCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}
