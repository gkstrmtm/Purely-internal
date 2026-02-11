import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalContactServiceTriggersSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const statements: string[] = [
    `
CREATE TABLE IF NOT EXISTS "PortalContactServiceTrigger" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "serviceSlug" TEXT NOT NULL,
  "triggerCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalContactServiceTrigger_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalContactServiceTrigger_ownerId_contactId_serviceSlug_key" ON "PortalContactServiceTrigger"("ownerId","contactId","serviceSlug");`,
    `CREATE INDEX IF NOT EXISTS "PortalContactServiceTrigger_ownerId_updatedAt_idx" ON "PortalContactServiceTrigger"("ownerId","updatedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalContactServiceTrigger_ownerId_contactId_idx" ON "PortalContactServiceTrigger"("ownerId","contactId");`,
    `CREATE INDEX IF NOT EXISTS "PortalContactServiceTrigger_ownerId_serviceSlug_idx" ON "PortalContactServiceTrigger"("ownerId","serviceSlug");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalContactServiceTrigger_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalContactServiceTrigger"
      ADD CONSTRAINT "PortalContactServiceTrigger_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PortalContact'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'PortalContactServiceTrigger_contactId_fkey'
    ) THEN
      ALTER TABLE "PortalContactServiceTrigger"
        ADD CONSTRAINT "PortalContactServiceTrigger_contactId_fkey"
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
