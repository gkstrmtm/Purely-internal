CREATE TABLE IF NOT EXISTS "CreditFunnelEvent" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "funnelId" TEXT NOT NULL,
  "pageId" TEXT,
  "eventType" TEXT NOT NULL,
  "eventPath" TEXT,
  "source" TEXT,
  "sessionId" TEXT,
  "referrer" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "utmTerm" TEXT,
  "contactId" TEXT,
  "bookingId" TEXT,
  "checkoutSessionId" TEXT,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditFunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CreditFunnelEvent_ownerId_createdAt_idx"
  ON "CreditFunnelEvent"("ownerId", "createdAt");

CREATE INDEX IF NOT EXISTS "CreditFunnelEvent_funnelId_createdAt_idx"
  ON "CreditFunnelEvent"("funnelId", "createdAt");

CREATE INDEX IF NOT EXISTS "CreditFunnelEvent_pageId_eventType_createdAt_idx"
  ON "CreditFunnelEvent"("pageId", "eventType", "createdAt");

CREATE INDEX IF NOT EXISTS "CreditFunnelEvent_sessionId_createdAt_idx"
  ON "CreditFunnelEvent"("sessionId", "createdAt");