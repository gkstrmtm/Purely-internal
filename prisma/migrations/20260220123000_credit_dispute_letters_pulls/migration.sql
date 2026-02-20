DO $$
BEGIN
  CREATE TYPE "CreditPullStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "CreditDisputeLetterStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CreditPull" (
  "id" TEXT NOT NULL PRIMARY KEY,

  "ownerId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,

  "provider" TEXT NOT NULL DEFAULT 'STUB',
  "status" "CreditPullStatus" NOT NULL DEFAULT 'PENDING',

  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  "rawJson" JSONB,
  "error" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditPull_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreditPull_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CreditPull_ownerId_requestedAt_idx" ON "CreditPull" ("ownerId", "requestedAt");
CREATE INDEX IF NOT EXISTS "CreditPull_ownerId_contactId_requestedAt_idx" ON "CreditPull" ("ownerId", "contactId", "requestedAt");
CREATE INDEX IF NOT EXISTS "CreditPull_contactId_requestedAt_idx" ON "CreditPull" ("contactId", "requestedAt");

CREATE TABLE IF NOT EXISTS "CreditDisputeLetter" (
  "id" TEXT NOT NULL PRIMARY KEY,

  "ownerId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,

  "creditPullId" TEXT,

  "status" "CreditDisputeLetterStatus" NOT NULL DEFAULT 'DRAFT',

  "subject" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,

  "promptText" TEXT,
  "model" TEXT,

  "generatedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastSentTo" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditDisputeLetter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreditDisputeLetter_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreditDisputeLetter_creditPullId_fkey" FOREIGN KEY ("creditPullId") REFERENCES "CreditPull"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CreditDisputeLetter_ownerId_createdAt_idx" ON "CreditDisputeLetter" ("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditDisputeLetter_ownerId_contactId_createdAt_idx" ON "CreditDisputeLetter" ("ownerId", "contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditDisputeLetter_contactId_createdAt_idx" ON "CreditDisputeLetter" ("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditDisputeLetter_creditPullId_idx" ON "CreditDisputeLetter" ("creditPullId");
