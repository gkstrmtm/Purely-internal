import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

async function contactsSchemaLooksReady(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PortalContact'
      ) AS "ok";
    `;
    return Boolean(rows?.[0]?.ok);
  } catch {
    return false;
  }
}

export async function ensurePortalContactsSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const ready = await contactsSchemaLooksReady();

  const statements: string[] = [
    ...(ready
      ? []
      : [
          `
CREATE TABLE IF NOT EXISTS "PortalContact" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "email" TEXT,
  "emailKey" TEXT,
  "phone" TEXT,
  "phoneKey" TEXT,
  "customVariables" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalContact_pkey" PRIMARY KEY ("id")
);
          `.trim(),
        ]),

    // Align with Prisma: updatedAt is set by app code/Prisma.
    `ALTER TABLE "PortalContact" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

    // Drift hardening: contact custom fields.
    `ALTER TABLE "PortalContact" ADD COLUMN IF NOT EXISTS "customVariables" JSONB;`,

    `CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_idx" ON "PortalContact"("ownerId");`,
    `CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_emailKey_idx" ON "PortalContact"("ownerId", "emailKey");`,
    `CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_phoneKey_idx" ON "PortalContact"("ownerId", "phoneKey");`,
    `CREATE INDEX IF NOT EXISTS "PortalContact_ownerId_nameKey_idx" ON "PortalContact"("ownerId", "nameKey");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalContact_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalContact"
      ADD CONSTRAINT "PortalContact_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}
