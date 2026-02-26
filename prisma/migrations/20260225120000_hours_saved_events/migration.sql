-- Add durable hours-saved event storage

CREATE TABLE IF NOT EXISTS "PortalHoursSavedEvent" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" VARCHAR(64) NOT NULL,
  "sourceId" VARCHAR(128) NOT NULL,
  "secondsSaved" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PortalHoursSavedEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PortalHoursSavedEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortalHoursSavedEvent_ownerId_kind_sourceId_key" ON "PortalHoursSavedEvent"("ownerId", "kind", "sourceId");
CREATE INDEX IF NOT EXISTS "PortalHoursSavedEvent_ownerId_occurredAt_idx" ON "PortalHoursSavedEvent"("ownerId", "occurredAt");
