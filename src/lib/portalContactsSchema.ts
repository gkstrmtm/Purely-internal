import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalContactsSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const statements: string[] = [
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalContact_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    // Align with Prisma: updatedAt is set by app code/Prisma.
    `ALTER TABLE "PortalContact" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

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
