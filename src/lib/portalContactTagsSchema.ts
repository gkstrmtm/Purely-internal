import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

async function contactTagsSchemaLooksReady(): Promise<boolean> {
  // We consider it ready if the core tables exist and the optional contactId
  // columns (added by this installer) already exist where applicable.
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        inboxThreadTable: boolean;
        leadTable: boolean;
        bookingTable: boolean;
        tag: boolean;
        assignment: boolean;
        inboxThreadContactId: boolean;
        leadContactId: boolean;
        bookingContactId: boolean;
      }>
    >`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalInboxThread'
        ) AS "inboxThreadTable",
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalLead'
        ) AS "leadTable",
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalBooking'
        ) AS "bookingTable",
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalContactTag'
        ) AS "tag",
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalContactTagAssignment'
        ) AS "assignment",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalInboxThread' AND column_name = 'contactId'
        ) AS "inboxThreadContactId",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalLead' AND column_name = 'contactId'
        ) AS "leadContactId",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalBooking' AND column_name = 'contactId'
        ) AS "bookingContactId";
    `;
    const r = rows?.[0];
    if (!r?.tag || !r?.assignment) return false;
    if (r.inboxThreadTable && !r.inboxThreadContactId) return false;
    if (r.leadTable && !r.leadContactId) return false;
    if (r.bookingTable && !r.bookingContactId) return false;
    return true;
  } catch {
    return false;
  }
}

function tableExistsSql(tableName: string) {
  const t = tableName.replace(/"/g, "");
  return `EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${t}')`;
}

export async function ensurePortalContactTagsSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  if (await contactTagsSchemaLooksReady()) {
    ensuredAt = Date.now();
    return;
  }

  const statements: string[] = [
    `
CREATE TABLE IF NOT EXISTS "PortalContactTag" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalContactTag_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `ALTER TABLE "PortalContactTag" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

    `
CREATE TABLE IF NOT EXISTS "PortalContactTagAssignment" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalContactTagAssignment_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalContactTag_ownerId_nameKey_key" ON "PortalContactTag"("ownerId", "nameKey");`,
    `CREATE INDEX IF NOT EXISTS "PortalContactTag_ownerId_idx" ON "PortalContactTag"("ownerId");`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalContactTagAssignment_contactId_tagId_key" ON "PortalContactTagAssignment"("contactId", "tagId");`,
    `CREATE INDEX IF NOT EXISTS "PortalContactTagAssignment_ownerId_createdAt_idx" ON "PortalContactTagAssignment"("ownerId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalContactTagAssignment_tagId_idx" ON "PortalContactTagAssignment"("tagId");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalContactTag_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalContactTag"
      ADD CONSTRAINT "PortalContactTag_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalContactTagAssignment_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalContactTagAssignment"
      ADD CONSTRAINT "PortalContactTagAssignment_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF ${tableExistsSql("PortalContact")} THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'PortalContactTagAssignment_contactId_fkey'
    ) THEN
      ALTER TABLE "PortalContactTagAssignment"
        ADD CONSTRAINT "PortalContactTagAssignment_contactId_fkey"
        FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalContactTagAssignment_tagId_fkey'
  ) THEN
    ALTER TABLE "PortalContactTagAssignment"
      ADD CONSTRAINT "PortalContactTagAssignment_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "PortalContactTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- Optional contact links in existing portal tables.
  IF ${tableExistsSql("PortalInboxThread")} THEN
    ALTER TABLE "PortalInboxThread" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
    CREATE INDEX IF NOT EXISTS "PortalInboxThread_ownerId_contactId_idx" ON "PortalInboxThread"("ownerId", "contactId");
  END IF;

  IF ${tableExistsSql("PortalLead")} THEN
    ALTER TABLE "PortalLead" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
    CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_contactId_idx" ON "PortalLead"("ownerId", "contactId");
  END IF;

  IF ${tableExistsSql("PortalBooking")} THEN
    ALTER TABLE "PortalBooking" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
    CREATE INDEX IF NOT EXISTS "PortalBooking_siteId_contactId_idx" ON "PortalBooking"("siteId", "contactId");

    IF ${tableExistsSql("PortalContact")} THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PortalBooking_contactId_fkey'
      ) THEN
        ALTER TABLE "PortalBooking"
          ADD CONSTRAINT "PortalBooking_contactId_fkey"
          FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
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
