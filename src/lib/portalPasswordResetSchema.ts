import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalPasswordResetSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const statements: string[] = [
    `
CREATE TABLE IF NOT EXISTS "PortalPasswordResetCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attemptCount" INTEGER,
  CONSTRAINT "PortalPasswordResetCode_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `ALTER TABLE "PortalPasswordResetCode" ALTER COLUMN "attemptCount" SET DEFAULT 0;`,

    `CREATE INDEX IF NOT EXISTS "PortalPasswordResetCode_userId_idx" ON "PortalPasswordResetCode"("userId");`,
    `CREATE INDEX IF NOT EXISTS "PortalPasswordResetCode_expiresAt_idx" ON "PortalPasswordResetCode"("expiresAt");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalPasswordResetCode_userId_fkey'
  ) THEN
    ALTER TABLE "PortalPasswordResetCode"
      ADD CONSTRAINT "PortalPasswordResetCode_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}
