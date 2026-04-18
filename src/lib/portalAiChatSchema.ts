import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

async function aiChatSchemaLooksReady(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ thread: boolean; message: boolean; run: boolean }>>`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatThread'
        ) AS "thread",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatThread' AND column_name = 'isPinned'
        ) AS "threadPinned",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatThread' AND column_name = 'pinnedAt'
        ) AS "threadPinnedAt",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatThread' AND column_name = 'forkedFromThreadId'
        ) AS "threadForkedFrom",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatThread' AND column_name = 'contextJson'
        ) AS "threadContext",
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatMessage'
        ) AS "message",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatMessage' AND column_name = 'repeatEveryMinutes'
        ) AS "messageRepeat",
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatRun'
        ) AS "run",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatRun' AND column_name = 'aiSummaryText'
        ) AS "runAiSummary",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PortalAiChatRun' AND column_name = 'aiSummaryGeneratedAt'
        ) AS "runAiSummaryGeneratedAt";
    `;
    const r = rows?.[0];
    return Boolean(
      r?.thread &&
        (r as any)?.threadPinned &&
        (r as any)?.threadPinnedAt &&
        (r as any)?.threadForkedFrom &&
        (r as any)?.threadContext &&
        r?.message &&
        (r as any)?.messageRepeat &&
        r?.run &&
        (r as any)?.runAiSummary &&
        (r as any)?.runAiSummaryGeneratedAt,
    );
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

    // Thread list UX: pinning + duplication metadata.
    `ALTER TABLE "PortalAiChatThread" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT FALSE;`,
    `ALTER TABLE "PortalAiChatThread" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);`,
    `ALTER TABLE "PortalAiChatThread" ADD COLUMN IF NOT EXISTS "forkedFromThreadId" TEXT;`,

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

    `
CREATE TABLE IF NOT EXISTS "PortalAiChatRun" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "assistantMessageId" TEXT,
  "scheduledMessageId" TEXT,
  "runId" TEXT,
  "triggerKind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "workTitle" TEXT,
  "canvasUrl" TEXT,
  "summaryText" TEXT,
  "aiSummaryText" TEXT,
  "aiSummaryGeneratedAt" TIMESTAMP(3),
  "stepsJson" JSONB,
  "followUpSuggestionsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "interruptedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalAiChatRun_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `ALTER TABLE "PortalAiChatRun" ALTER COLUMN "updatedAt" DROP DEFAULT;`,
    `ALTER TABLE "PortalAiChatRun" ADD COLUMN IF NOT EXISTS "aiSummaryText" TEXT;`,
    `ALTER TABLE "PortalAiChatRun" ADD COLUMN IF NOT EXISTS "aiSummaryGeneratedAt" TIMESTAMP(3);`,

    `CREATE INDEX IF NOT EXISTS "PortalAiChatThread_ownerId_lastMessageAt_idx" ON "PortalAiChatThread"("ownerId", "lastMessageAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiChatThread_ownerId_isPinned_pinnedAt_idx" ON "PortalAiChatThread"("ownerId", "isPinned", "pinnedAt");`,

    `CREATE INDEX IF NOT EXISTS "PortalAiChatMessage_threadId_createdAt_idx" ON "PortalAiChatMessage"("threadId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiChatMessage_ownerId_createdAt_idx" ON "PortalAiChatMessage"("ownerId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiChatRun_threadId_createdAt_idx" ON "PortalAiChatRun"("threadId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiChatRun_ownerId_createdAt_idx" ON "PortalAiChatRun"("ownerId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAiChatRun_threadId_status_createdAt_idx" ON "PortalAiChatRun"("threadId", "status", "createdAt");`,

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

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatRun_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatRun"
      ADD CONSTRAINT "PortalAiChatRun_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatRun_threadId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatRun"
      ADD CONSTRAINT "PortalAiChatRun_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "PortalAiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalAiChatRun_assistantMessageId_fkey'
  ) THEN
    ALTER TABLE "PortalAiChatRun"
      ADD CONSTRAINT "PortalAiChatRun_assistantMessageId_fkey"
      FOREIGN KEY ("assistantMessageId") REFERENCES "PortalAiChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}
