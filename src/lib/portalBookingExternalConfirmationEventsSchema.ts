import { prisma } from "@/lib/db";
import { ensurePortalBookingExternalLinkEventsSchema } from "@/lib/portalBookingExternalLinkEventsSchema";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

async function eventsSchemaLooksReady(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PortalBookingExternalConfirmationEvent'
      ) AS "ok";
    `;
    return Boolean(rows?.[0]?.ok);
  } catch {
    return false;
  }
}

export async function ensurePortalBookingExternalConfirmationEventsSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  await ensurePortalBookingExternalLinkEventsSchema().catch(() => null);

  const ready = await eventsSchemaLooksReady();
  const statements: string[] = [
    ...(ready
      ? []
      : [
          `
CREATE TABLE IF NOT EXISTS "PortalBookingExternalConfirmationEvent" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "siteId" TEXT,
  "contactId" TEXT,
  "handoffEventId" TEXT,
  "portalVariant" "ClientPortalVariant",
  "confirmationKind" TEXT NOT NULL,
  "bookingStatus" TEXT,
  "providerKey" TEXT NOT NULL,
  "providerLabel" TEXT NOT NULL,
  "externalUrlHost" TEXT NOT NULL,
  "providerEventId" TEXT,
  "providerEventType" TEXT,
  "externalBookingId" TEXT,
  "providerReference" TEXT,
  "confirmationTokenHash" TEXT NOT NULL DEFAULT '',
  "payloadHash" TEXT NOT NULL DEFAULT '',
  "verificationMethod" TEXT,
  "sourceRoute" TEXT,
  "sourceCampaign" TEXT,
  "referrerHost" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "metaJson" JSONB,
  "scheduledStartAt" TIMESTAMP(3),
  "scheduledEndAt" TIMESTAMP(3),
  "providerOccurredAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalBookingExternalConfirmationEvent_pkey" PRIMARY KEY ("id")
);
          `.trim(),
        ]),
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "siteId" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "contactId" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "handoffEventId" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "portalVariant" "ClientPortalVariant";`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "confirmationKind" TEXT NOT NULL DEFAULT 'redirect_return';`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "bookingStatus" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "providerKey" TEXT NOT NULL DEFAULT 'unknown';`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "providerLabel" TEXT NOT NULL DEFAULT 'External booking page';`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "externalUrlHost" TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "providerEventId" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "providerEventType" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "externalBookingId" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "providerReference" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "confirmationTokenHash" TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "payloadHash" TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "verificationMethod" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "sourceRoute" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "sourceCampaign" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "referrerHost" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "ipHash" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "metaJson" JSONB;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "scheduledStartAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "scheduledEndAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "providerOccurredAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE "PortalBookingExternalConfirmationEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_confirmedAt_idx" ON "PortalBookingExternalConfirmationEvent"("ownerId", "confirmedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_siteId_confirmedAt_idx" ON "PortalBookingExternalConfirmationEvent"("ownerId", "siteId", "confirmedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_contactId_confirmedAt_idx" ON "PortalBookingExternalConfirmationEvent"("ownerId", "contactId", "confirmedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_handoffEventId_confirmedAt_idx" ON "PortalBookingExternalConfirmationEvent"("ownerId", "handoffEventId", "confirmedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_tokenHash_confirmedAt_idx" ON "PortalBookingExternalConfirmationEvent"("ownerId", "confirmationTokenHash", "confirmedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_externalBookingId_confirmedAt_idx" ON "PortalBookingExternalConfirmationEvent"("ownerId", "externalBookingId", "confirmedAt");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_siteId_providerReference_key" ON "PortalBookingExternalConfirmationEvent"("ownerId", "siteId", "providerReference") WHERE "providerReference" IS NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalBookingExternalConfirmationEvent_ownerId_providerKey_providerEventId_key" ON "PortalBookingExternalConfirmationEvent"("ownerId", "providerKey", "providerEventId") WHERE "providerEventId" IS NOT NULL;`,
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBookingExternalConfirmationEvent_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalBookingExternalConfirmationEvent"
      ADD CONSTRAINT "PortalBookingExternalConfirmationEvent_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBookingExternalConfirmationEvent_siteId_fkey'
  ) THEN
    ALTER TABLE "PortalBookingExternalConfirmationEvent"
      ADD CONSTRAINT "PortalBookingExternalConfirmationEvent_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "PortalBookingSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBookingExternalConfirmationEvent_contactId_fkey'
  ) THEN
    ALTER TABLE "PortalBookingExternalConfirmationEvent"
      ADD CONSTRAINT "PortalBookingExternalConfirmationEvent_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalBookingExternalConfirmationEvent_handoffEventId_fkey'
  ) THEN
    ALTER TABLE "PortalBookingExternalConfirmationEvent"
      ADD CONSTRAINT "PortalBookingExternalConfirmationEvent_handoffEventId_fkey"
      FOREIGN KEY ("handoffEventId") REFERENCES "PortalBookingExternalLinkEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}