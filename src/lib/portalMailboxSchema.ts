import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalMailboxSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const statements: string[] = [
    `
CREATE TABLE IF NOT EXISTS "PortalMailboxAddress" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "localPart" TEXT NOT NULL,
  "emailAddress" TEXT NOT NULL,
  "emailKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalMailboxAddress_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    // Align with Prisma behavior (@updatedAt is written by Prisma).
    `ALTER TABLE "PortalMailboxAddress" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

    // Allow a one-time user customization of their alias.
    `ALTER TABLE "PortalMailboxAddress" ADD COLUMN IF NOT EXISTS "customizeCount" INTEGER;`,
    `ALTER TABLE "PortalMailboxAddress" ADD COLUMN IF NOT EXISTS "customizedAt" TIMESTAMP(3);`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMailboxAddress_ownerId_key" ON "PortalMailboxAddress"("ownerId");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMailboxAddress_emailKey_key" ON "PortalMailboxAddress"("emailKey");`,
    `CREATE INDEX IF NOT EXISTS "PortalMailboxAddress_ownerId_idx" ON "PortalMailboxAddress"("ownerId");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMailboxAddress_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalMailboxAddress"
      ADD CONSTRAINT "PortalMailboxAddress_ownerId_fkey"
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
