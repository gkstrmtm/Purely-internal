DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PortalApiKeyKind') THEN
    CREATE TYPE "PortalApiKeyKind" AS ENUM ('FULL_ACCESS', 'SCOPED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PortalApiKeyStatus') THEN
    CREATE TYPE "PortalApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PortalApiKey" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyKind" "PortalApiKeyKind" NOT NULL DEFAULT 'SCOPED',
  "status" "PortalApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  "keyHash" TEXT NOT NULL,
  "secretCiphertext" TEXT NOT NULL,
  "secretIv" TEXT NOT NULL,
  "secretAuthTag" TEXT NOT NULL,
  "maskedKey" TEXT NOT NULL,
  "permissionsJson" JSONB,
  "creditLimit" INTEGER,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3),
  "revealedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortalApiKey_keyHash_key" ON "PortalApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "PortalApiKey_ownerId_keyKind_status_idx" ON "PortalApiKey"("ownerId", "keyKind", "status");
CREATE INDEX IF NOT EXISTS "PortalApiKey_ownerId_createdAt_idx" ON "PortalApiKey"("ownerId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'PortalApiKey_ownerId_fkey'
      AND table_name = 'PortalApiKey'
  ) THEN
    ALTER TABLE "PortalApiKey"
      ADD CONSTRAINT "PortalApiKey_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PortalApiKeySpend" (
  "id" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalApiKeySpend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortalApiKeySpend_apiKeyId_idempotencyKey_key" ON "PortalApiKeySpend"("apiKeyId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "PortalApiKeySpend_ownerId_createdAt_idx" ON "PortalApiKeySpend"("ownerId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'PortalApiKeySpend_apiKeyId_fkey'
      AND table_name = 'PortalApiKeySpend'
  ) THEN
    ALTER TABLE "PortalApiKeySpend"
      ADD CONSTRAINT "PortalApiKeySpend_apiKeyId_fkey"
      FOREIGN KEY ("apiKeyId") REFERENCES "PortalApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'PortalApiKeySpend_ownerId_fkey'
      AND table_name = 'PortalApiKeySpend'
  ) THEN
    ALTER TABLE "PortalApiKeySpend"
      ADD CONSTRAINT "PortalApiKeySpend_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
