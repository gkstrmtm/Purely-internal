import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

const ENSURE_TTL_MS = 60 * 60 * 1000;
const PORTAL_AI_CHAT_SCHEMA_TIMEOUT_MS = 8_000;

type PortalAiChatSchemaEnsureState = {
  ensuredAt: number;
  inFlight: Promise<void> | null;
};

declare global {
  var __paPortalAiChatSchemaEnsureState: PortalAiChatSchemaEnsureState | undefined;
}

function getPortalAiChatSchemaEnsureState(): PortalAiChatSchemaEnsureState {
  if (!globalThis.__paPortalAiChatSchemaEnsureState) {
    globalThis.__paPortalAiChatSchemaEnsureState = {
      ensuredAt: 0,
      inFlight: null,
    };
  }
  return globalThis.__paPortalAiChatSchemaEnsureState;
}

class PortalAiChatSchemaTimeoutError extends Error {
  constructor(message = "Portal AI chat schema request timed out") {
    super(message);
    this.name = "PortalAiChatSchemaTimeoutError";
  }
}

async function withPortalAiChatSchemaTimeout<T>(work: Promise<T>, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new PortalAiChatSchemaTimeoutError(label || "Portal AI chat schema request timed out")),
          PORTAL_AI_CHAT_SCHEMA_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function aiChatSchemaLooksReady(): Promise<boolean> {
  try {
    await Promise.all([
      (prisma as any).portalAiChatThread.findFirst({
        select: {
          id: true,
          isPinned: true,
          pinnedAt: true,
          forkedFromThreadId: true,
          contextJson: true,
        },
      }),
      (prisma as any).portalAiChatMessage.findFirst({
        select: {
          id: true,
          repeatEveryMinutes: true,
        },
      }),
      (prisma as any).portalAiChatRun.findFirst({
        select: {
          id: true,
          aiSummaryText: true,
          aiSummaryGeneratedAt: true,
        },
      }),
    ]);
    return true;
  } catch (error) {
    if (isMissingPortalAiChatSchemaError(error)) {
      return false;
    }
    if (isTransientPortalAiChatSchemaDbError(error)) {
      throw error;
    }
    return false;
  }
}

function isMissingPortalAiChatSchemaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") return true;
  }

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;

  return (
    (normalized.includes("does not exist") && normalized.includes("column")) ||
    (normalized.includes("does not exist") && normalized.includes("relation")) ||
    normalized.includes("no such table")
  );
}

function isTransientPortalAiChatSchemaDbError(error: unknown): boolean {
  if (error instanceof PortalAiChatSchemaTimeoutError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1017" || error.code === "P2024") return true;
  }

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;

  return (
    (normalized.includes("connection pool") && normalized.includes("timed out")) ||
    normalized.includes("server has closed the connection") ||
    normalized.includes("connection terminated unexpectedly") ||
    normalized.includes("connection reset") ||
    normalized.includes("connection refused")
  );
}

export async function ensurePortalAiChatSchema(): Promise<void> {
  const state = getPortalAiChatSchemaEnsureState();
  const now = Date.now();
  if (state.ensuredAt && now - state.ensuredAt < ENSURE_TTL_MS) return;
  if (state.inFlight) {
    try {
      await withPortalAiChatSchemaTimeout(state.inFlight, "Portal AI chat schema bootstrap wait timed out");
      return;
    } catch (error) {
      if (!isTransientPortalAiChatSchemaDbError(error)) throw error;
      state.inFlight = null;
    }
  }

  state.inFlight = (async () => {
    const runStartedAt = Date.now();
    if (state.ensuredAt && runStartedAt - state.ensuredAt < ENSURE_TTL_MS) return;

    if (await withPortalAiChatSchemaTimeout(aiChatSchemaLooksReady(), "Portal AI chat schema readiness check timed out")) {
      state.ensuredAt = Date.now();
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
      await withPortalAiChatSchemaTimeout(
        prisma.$executeRawUnsafe(statement),
        "Portal AI chat schema bootstrap statement timed out",
      );
    }

    state.ensuredAt = Date.now();
  })();

  try {
    await withPortalAiChatSchemaTimeout(state.inFlight, "Portal AI chat schema bootstrap timed out");
  } finally {
    if (state.inFlight) state.inFlight = null;
  }
}
