import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

async function eventsSchemaLooksReady(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PortalBookingExternalLinkEvent'
      ) AS "ok";
    `;
    return Boolean(rows?.[0]?.ok);
  } catch {
    return false;
  }
}

export async function ensurePortalBookingExternalLinkEventsSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const ready = await eventsSchemaLooksReady();
  const statements: string[] = [
    ...(ready
      ? []
      : [
          `
CREATE TABLE IF NOT EXISTS "PortalBookingExternalLinkEvent" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "siteId" TEXT,
  "contactId" TEXT,
  "portalVariant" "ClientPortalVariant",
  "handoffMode" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "providerLabel" TEXT NOT NULL,
  "externalUrlHost" TEXT NOT NULL,
  "sourceRoute" TEXT,
  "sourceCampaign" TEXT,
  "referrerHost" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "metaJson" JSONB,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalBookingExternalLinkEvent_pkey" PRIMARY KEY ("id")
);
          `.trim(),
        ]),
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "siteId" TEXT;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "contactId" TEXT;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "portalVariant" "ClientPortalVariant";`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "handoffMode" TEXT NOT NULL DEFAULT 'direct_book';`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "providerKey" TEXT NOT NULL DEFAULT 'unknown';`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "providerLabel" TEXT NOT NULL DEFAULT 'External booking page';`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "externalUrlHost" TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "sourceRoute" TEXT;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "sourceCampaign" TEXT;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "referrerHost" TEXT;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "ipHash" TEXT;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "metaJson" JSONB;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE "PortalBookingExternalLinkEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalLinkEvent_ownerId_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "clickedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalLinkEvent_ownerId_siteId_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "siteId", "clickedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalLinkEvent_ownerId_contactId_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "contactId", "clickedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalLinkEvent_ownerId_providerKey_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "providerKey", "clickedAt");`,
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBookingExternalLinkEvent_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalBookingExternalLinkEvent"
      ADD CONSTRAINT "PortalBookingExternalLinkEvent_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBookingExternalLinkEvent_siteId_fkey'
  ) THEN
    ALTER TABLE "PortalBookingExternalLinkEvent"
      ADD CONSTRAINT "PortalBookingExternalLinkEvent_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "PortalBookingSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBookingExternalLinkEvent_contactId_fkey'
  ) THEN
    ALTER TABLE "PortalBookingExternalLinkEvent"
      ADD CONSTRAINT "PortalBookingExternalLinkEvent_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}