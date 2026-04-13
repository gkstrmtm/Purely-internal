DO $$
BEGIN
  CREATE TYPE "HostedPageService" AS ENUM ('BOOKING', 'NEWSLETTER', 'REVIEWS', 'BLOGS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "HostedPageDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "HostedPageDocument" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "service" "HostedPageService" NOT NULL,
  "pageKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT,
  "status" "HostedPageDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "contentMarkdown" TEXT NOT NULL DEFAULT '',
  "editorMode" "CreditFunnelPageEditorMode" NOT NULL DEFAULT 'BLOCKS',
  "blocksJson" JSONB,
  "customHtml" TEXT NOT NULL DEFAULT '',
  "customChatJson" JSONB,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "themeJson" JSONB,
  "dataBindingsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostedPageDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HostedPageDocument_ownerId_service_pageKey_key"
  ON "HostedPageDocument"("ownerId", "service", "pageKey");

CREATE UNIQUE INDEX IF NOT EXISTS "HostedPageDocument_ownerId_service_slug_key"
  ON "HostedPageDocument"("ownerId", "service", "slug");

CREATE INDEX IF NOT EXISTS "HostedPageDocument_ownerId_service_updatedAt_idx"
  ON "HostedPageDocument"("ownerId", "service", "updatedAt");

DO $$
BEGIN
  ALTER TABLE "HostedPageDocument"
    ADD CONSTRAINT "HostedPageDocument_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
