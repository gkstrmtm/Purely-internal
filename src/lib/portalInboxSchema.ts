import { prisma } from "@/lib/db";

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalInboxSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  // Idempotent schema installer (avoids prisma migrate in slow prod envs).
  // IMPORTANT: Prisma raw execution commonly rejects multi-statement queries,
  // so we execute each statement separately.
  const statements: string[] = [
    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalInboxChannel'
  ) THEN
    CREATE TYPE "PortalInboxChannel" AS ENUM ('EMAIL', 'SMS');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalInboxDirection'
  ) THEN
    CREATE TYPE "PortalInboxDirection" AS ENUM ('IN', 'OUT');
  END IF;
END $$;
    `.trim(),

    `
CREATE TABLE IF NOT EXISTS "PortalInboxThread" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "channel" "PortalInboxChannel" NOT NULL,
  "threadKey" TEXT NOT NULL,
  "peerAddress" TEXT NOT NULL,
  "peerKey" TEXT NOT NULL,
  "subject" TEXT,
  "subjectKey" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessagePreview" TEXT NOT NULL DEFAULT '',
  "lastMessageDirection" "PortalInboxDirection" NOT NULL DEFAULT 'IN',
  "lastMessageFrom" TEXT NOT NULL DEFAULT '',
  "lastMessageTo" TEXT NOT NULL DEFAULT '',
  "lastMessageSubject" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalInboxThread_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    // Align with the Prisma migration (older runtime installs may have added a default).
    `ALTER TABLE "PortalInboxThread" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

    `
CREATE TABLE IF NOT EXISTS "PortalInboxMessage" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "channel" "PortalInboxChannel" NOT NULL,
  "direction" "PortalInboxDirection" NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  "subject" TEXT,
  "bodyText" TEXT NOT NULL,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalInboxMessage_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `
CREATE TABLE IF NOT EXISTS "PortalInboxAttachment" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "messageId" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "publicToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalInboxAttachment_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalInboxThread_ownerId_channel_threadKey_key" ON "PortalInboxThread"("ownerId", "channel", "threadKey");`,
    `CREATE INDEX IF NOT EXISTS "PortalInboxThread_ownerId_channel_lastMessageAt_idx" ON "PortalInboxThread"("ownerId", "channel", "lastMessageAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalInboxThread_ownerId_channel_peerKey_idx" ON "PortalInboxThread"("ownerId", "channel", "peerKey");`,

    `CREATE INDEX IF NOT EXISTS "PortalInboxMessage_threadId_createdAt_idx" ON "PortalInboxMessage"("threadId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalInboxMessage_ownerId_channel_createdAt_idx" ON "PortalInboxMessage"("ownerId", "channel", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalInboxMessage_providerMessageId_idx" ON "PortalInboxMessage"("providerMessageId");`,

    `CREATE INDEX IF NOT EXISTS "PortalInboxAttachment_ownerId_createdAt_idx" ON "PortalInboxAttachment"("ownerId", "createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalInboxAttachment_messageId_idx" ON "PortalInboxAttachment"("messageId");`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalInboxThread_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalInboxThread"
      ADD CONSTRAINT "PortalInboxThread_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalInboxMessage_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalInboxMessage"
      ADD CONSTRAINT "PortalInboxMessage_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalInboxMessage_threadId_fkey'
  ) THEN
    ALTER TABLE "PortalInboxMessage"
      ADD CONSTRAINT "PortalInboxMessage_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "PortalInboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalInboxAttachment_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalInboxAttachment"
      ADD CONSTRAINT "PortalInboxAttachment_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalInboxAttachment_messageId_fkey'
  ) THEN
    ALTER TABLE "PortalInboxAttachment"
      ADD CONSTRAINT "PortalInboxAttachment_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "PortalInboxMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  ensuredAt = Date.now();
}
