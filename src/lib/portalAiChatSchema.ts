import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

async function aiChatSchemaLooksReady(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ thread: boolean; message: boolean }>>`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatThread'
        ) AS "thread",
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatMessage'
        ) AS "message";
    `;
    const r = rows?.[0];
    return Boolean(r?.thread && r?.message);
  } catch {
    return false;
  }
}

export async function ensurePortalAiChatSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  if (await aiChatSchemaLooksReady()) {
    ensuredAt = Date.now();
    return;
  }

  const statements: string[] = [
    `
CREATE TABLE IF NOT EXISTS "PortalAiChatThread" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New chat',
  "createdByUserId" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "contextJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalAiChatThread_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    // Align with Prisma (older runtime installs may have added a default).
    `ALTER TABLE "PortalAiChatThread" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

    // Older installs may have the table without newer context fields.
    `ALTER TABLE "PortalAiChatThread" ADD COLUMN IF NOT EXISTS "contextJson" JSONB;`,

    `
CREATE TABLE IF NOT EXISTS "PortalAiChatMessage" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "attachmentsJson" JSONB,
  "createdByUserId" TEXT,
  "sendAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "repeatEveryMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalAiChatMessage_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    // Older installs may already have the table without newer scheduling fields.
    `ALTER TABLE "PortalAiChatMessage" ADD COLUMN IF NOT EXISTS "repeatEveryMinutes" INTEGER;`,

    `CREATE INDEX IF NOT EXISTS "PortalAiChatThread_ownerId_lastMessageAt_idx" ON "PortalAiChatThread"("ownerId", "lastMessageAt");`,

    `CREATE INDEX IF NOT EXISTS "PortalAiChatMessage_threadId_createdAt_idx" ON "PortalAiChatMessage"("threadId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiChatMessage_ownerId_createdAt_idx" ON "PortalAiChatMessage"("ownerId", "createdAt");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatThread_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatThread"
      ADD CONSTRAINT "PortalAiChatThread_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatThread_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatThread"
      ADD CONSTRAINT "PortalAiChatThread_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatMessage_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatMessage"
      ADD CONSTRAINT "PortalAiChatMessage_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatMessage_threadId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatMessage"
      ADD CONSTRAINT "PortalAiChatMessage_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "PortalAiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatMessage_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatMessage"
      ADD CONSTRAINT "PortalAiChatMessage_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}
