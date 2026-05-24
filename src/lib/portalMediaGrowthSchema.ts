import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

async function growthSchemaLooksReady(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PortalMediaGrowthProfile'
      ) AS "ok";
    `;
    return Boolean(rows?.[0]?.ok);
  } catch {
    return false;
  }
}

export async function ensurePortalMediaGrowthSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const ready = await growthSchemaLooksReady();
  const statements: string[] = [
    ...(ready
      ? []
      : [
          `
CREATE TABLE IF NOT EXISTS "PortalMediaGrowthProfile" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "mediaItemId" TEXT NOT NULL,
  "workflowState" TEXT NOT NULL DEFAULT 'needs_review',
  "assetPurpose" TEXT,
  "relatedOffer" TEXT,
  "targetPlatform" TEXT,
  "campaignLabel" TEXT,
  "captionDraft" TEXT,
  "ctaLabel" TEXT,
  "ctaHref" TEXT,
  "notes" TEXT,
  "bookingLinkUrl" TEXT,
  "funnelId" TEXT,
  "funnelName" TEXT,
  "funnelSlug" TEXT,
  "funnelPageId" TEXT,
  "funnelPageTitle" TEXT,
  "funnelPageSlug" TEXT,
  "plannedForAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "postedAt" TIMESTAMP(3),
  "postedUrl" TEXT,
  "distributionProvider" TEXT,
  "providerConnectionState" TEXT,
  "providerPublishState" TEXT,
  "providerAccountLabel" TEXT,
  "queueOrder" INTEGER,
  "dailyPostCap" INTEGER,
  "providerPostId" TEXT,
  "providerLastError" TEXT,
  "providerLastAttemptAt" TIMESTAMP(3),
  "providerPublishedAt" TIMESTAMP(3),
  "metricsImpressions" INTEGER,
  "metricsReach" INTEGER,
  "metricsEngagementCount" INTEGER,
  "metricsClickCount" INTEGER,
  "metricsSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalMediaGrowthProfile_pkey" PRIMARY KEY ("id")
);
          `.trim(),
        ]),
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "ownerId" TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "mediaItemId" TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "workflowState" TEXT NOT NULL DEFAULT 'needs_review';`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "assetPurpose" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "relatedOffer" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "targetPlatform" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "campaignLabel" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "captionDraft" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "ctaLabel" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "ctaHref" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "notes" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "bookingLinkUrl" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "funnelId" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "funnelName" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "funnelSlug" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "funnelPageId" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "funnelPageTitle" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "funnelPageSlug" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "plannedForAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "postedUrl" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "distributionProvider" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "providerConnectionState" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "providerPublishState" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "providerAccountLabel" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "queueOrder" INTEGER;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "dailyPostCap" INTEGER;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "providerPostId" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "providerLastError" TEXT;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "providerLastAttemptAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "providerPublishedAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "metricsImpressions" INTEGER;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "metricsReach" INTEGER;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "metricsEngagementCount" INTEGER;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "metricsClickCount" INTEGER;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "metricsSyncedAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE "PortalMediaGrowthProfile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_mediaItemId_key" ON "PortalMediaGrowthProfile"("mediaItemId");`,
    `CREATE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_ownerId_workflowState_updatedAt_idx" ON "PortalMediaGrowthProfile"("ownerId", "workflowState", "updatedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_ownerId_campaignLabel_idx" ON "PortalMediaGrowthProfile"("ownerId", "campaignLabel");`,
    `CREATE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_ownerId_targetPlatform_idx" ON "PortalMediaGrowthProfile"("ownerId", "targetPlatform");`,
    `CREATE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_ownerId_plannedForAt_idx" ON "PortalMediaGrowthProfile"("ownerId", "plannedForAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_ownerId_postedAt_idx" ON "PortalMediaGrowthProfile"("ownerId", "postedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_ownerId_distributionProvider_idx" ON "PortalMediaGrowthProfile"("ownerId", "distributionProvider");`,
    `CREATE INDEX IF NOT EXISTS "PortalMediaGrowthProfile_ownerId_providerPublishState_idx" ON "PortalMediaGrowthProfile"("ownerId", "providerPublishState");`,
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaGrowthProfile_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalMediaGrowthProfile"
      ADD CONSTRAINT "PortalMediaGrowthProfile_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaGrowthProfile_mediaItemId_fkey'
  ) THEN
    ALTER TABLE "PortalMediaGrowthProfile"
      ADD CONSTRAINT "PortalMediaGrowthProfile_mediaItemId_fkey"
      FOREIGN KEY ("mediaItemId") REFERENCES "PortalMediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
    `UPDATE "PortalMediaGrowthProfile" SET "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP);`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}