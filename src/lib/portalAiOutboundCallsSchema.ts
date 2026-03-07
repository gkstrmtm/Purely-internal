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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalAiOutboundMessageEnrollmentStatus'
  ) THEN
    CREATE TYPE "PortalAiOutboundMessageEnrollmentStatus" AS ENUM ('QUEUED','ACTIVE','FAILED','SKIPPED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalAiOutboundMessageEnrollmentSource'
  ) THEN
    CREATE TYPE "PortalAiOutboundMessageEnrollmentSource" AS ENUM ('TAG','MANUAL','INBOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalAiOutboundMessageChannelPolicy'
  ) THEN
    CREATE TYPE "PortalAiOutboundMessageChannelPolicy" AS ENUM ('SMS','EMAIL','BOTH');
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
  "chatAudienceTagIdsJson" JSONB,
  "script" TEXT NOT NULL DEFAULT 'Hi, this is an automated call. Please call us back when you have a moment.',
  "voiceAgentId" TEXT,
  "voiceAgentConfigJson" JSONB,
  "chatAgentId" TEXT,
  "chatAgentConfigJson" JSONB,
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
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "chatAudienceTagIdsJson" JSONB;
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "chatAgentId" TEXT;
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "chatAgentConfigJson" JSONB;
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "messageChannelPolicy" "PortalAiOutboundMessageChannelPolicy" NOT NULL DEFAULT 'BOTH';
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "callOutcomeTaggingJson" JSONB;
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundCallCampaign"
  ADD COLUMN IF NOT EXISTS "messageOutcomeTaggingJson" JSONB;
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

  `
CREATE TABLE IF NOT EXISTS "PortalAiOutboundMessageEnrollment" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "PortalAiOutboundMessageEnrollmentStatus" NOT NULL DEFAULT 'QUEUED',
  "source" "PortalAiOutboundMessageEnrollmentSource" NOT NULL DEFAULT 'TAG',
  "channelPolicy" "PortalAiOutboundMessageChannelPolicy" NOT NULL DEFAULT 'BOTH',
  "nextSendAt" TIMESTAMP(3),
  "sentFirstMessageAt" TIMESTAMP(3),
  "threadId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "pendingReplyToMessageId" TEXT,
  "nextReplyAt" TIMESTAMP(3),
  "replyAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "replyLastError" TEXT,
  "lastAutoRepliedMessageId" TEXT,
  "lastAutoReplyAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalAiOutboundMessageEnrollment_pkey" PRIMARY KEY ("id")
);
  `.trim(),

    `
ALTER TABLE "PortalAiOutboundMessageEnrollment"
  ADD COLUMN IF NOT EXISTS "source" "PortalAiOutboundMessageEnrollmentSource" NOT NULL DEFAULT 'TAG';
    `.trim(),

    `
ALTER TABLE "PortalAiOutboundMessageEnrollment"
  ADD COLUMN IF NOT EXISTS "channelPolicy" "PortalAiOutboundMessageChannelPolicy" NOT NULL DEFAULT 'BOTH';
    `.trim(),

    `
UPDATE "PortalAiOutboundMessageEnrollment"
  SET "source" = 'TAG'
  WHERE "source" IS NULL;
    `.trim(),

    `
UPDATE "PortalAiOutboundMessageEnrollment"
  SET "channelPolicy" = 'BOTH'
  WHERE "channelPolicy" IS NULL;
    `.trim(),

    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallCampaign_ownerId_updatedAt_idx" ON "PortalAiOutboundCallCampaign"("ownerId","updatedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallCampaign_ownerId_status_updatedAt_idx" ON "PortalAiOutboundCallCampaign"("ownerId","status","updatedAt");`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_campaignId_contactId_key" ON "PortalAiOutboundCallEnrollment"("campaignId","contactId");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_ownerId_status_nextCallAt_idx" ON "PortalAiOutboundCallEnrollment"("ownerId","status","nextCallAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_campaignId_status_nextCallAt_idx" ON "PortalAiOutboundCallEnrollment"("campaignId","status","nextCallAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundCallEnrollment_ownerId_contactId_idx" ON "PortalAiOutboundCallEnrollment"("ownerId","contactId");`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_campaignId_contactId_key" ON "PortalAiOutboundMessageEnrollment"("campaignId","contactId");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_ownerId_status_nextSendAt_idx" ON "PortalAiOutboundMessageEnrollment"("ownerId","status","nextSendAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_campaignId_status_nextSendAt_idx" ON "PortalAiOutboundMessageEnrollment"("campaignId","status","nextSendAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_ownerId_contactId_idx" ON "PortalAiOutboundMessageEnrollment"("ownerId","contactId");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_ownerId_nextReplyAt_idx" ON "PortalAiOutboundMessageEnrollment"("ownerId","nextReplyAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_campaignId_nextReplyAt_idx" ON "PortalAiOutboundMessageEnrollment"("campaignId","nextReplyAt");`,

    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_campaignId_source_updatedAt_idx" ON "PortalAiOutboundMessageEnrollment"("campaignId","source","updatedAt");`,

    `CREATE INDEX IF NOT EXISTS "PortalAiOutboundMessageEnrollment_campaignId_channelPolicy_updatedAt_idx" ON "PortalAiOutboundMessageEnrollment"("campaignId","channelPolicy","updatedAt");`,

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
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundMessageEnrollment_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundMessageEnrollment"
      ADD CONSTRAINT "PortalAiOutboundMessageEnrollment_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundCallEnrollment_campaignId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundCallEnrollment"
      ADD CONSTRAINT "PortalAiOutboundCallEnrollment_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "PortalAiOutboundCallCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundMessageEnrollment_campaignId_fkey'
  ) THEN
    ALTER TABLE "PortalAiOutboundMessageEnrollment"
      ADD CONSTRAINT "PortalAiOutboundMessageEnrollment_campaignId_fkey"
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

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiOutboundMessageEnrollment_contactId_fkey'
    ) THEN
      ALTER TABLE "PortalAiOutboundMessageEnrollment"
        ADD CONSTRAINT "PortalAiOutboundMessageEnrollment_contactId_fkey"
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
