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
  "stepsJson" JSONB,
  "followUpSuggestionsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "interruptedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalAiChatRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PortalAiChatRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PortalAiChatRun_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "PortalAiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PortalAiChatRun_assistantMessageId_fkey" FOREIGN KEY ("assistantMessageId") REFERENCES "PortalAiChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PortalAiChatRun_threadId_createdAt_idx" ON "PortalAiChatRun" ("threadId", "createdAt");
CREATE INDEX IF NOT EXISTS "PortalAiChatRun_ownerId_createdAt_idx" ON "PortalAiChatRun" ("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PortalAiChatRun_threadId_status_createdAt_idx" ON "PortalAiChatRun" ("threadId", "status", "createdAt");
