-- Portal media library base tables (idempotent)

CREATE TABLE IF NOT EXISTS "PortalMediaFolder" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalMediaFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PortalMediaItem" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "folderId" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "tag" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalMediaItem_pkey" PRIMARY KEY ("id")
);

-- Foreign keys (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaFolder_ownerId_fkey') THEN
    ALTER TABLE "PortalMediaFolder"
      ADD CONSTRAINT "PortalMediaFolder_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaFolder_parentId_fkey') THEN
    ALTER TABLE "PortalMediaFolder"
      ADD CONSTRAINT "PortalMediaFolder_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "PortalMediaFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaItem_ownerId_fkey') THEN
    ALTER TABLE "PortalMediaItem"
      ADD CONSTRAINT "PortalMediaItem_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaItem_folderId_fkey') THEN
    ALTER TABLE "PortalMediaItem"
      ADD CONSTRAINT "PortalMediaItem_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "PortalMediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Uniques + indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "PortalMediaFolder_ownerId_tag_key" ON "PortalMediaFolder"("ownerId", "tag");
CREATE INDEX IF NOT EXISTS "PortalMediaFolder_ownerId_parentId_nameKey_idx" ON "PortalMediaFolder"("ownerId", "parentId", "nameKey");

CREATE UNIQUE INDEX IF NOT EXISTS "PortalMediaItem_ownerId_tag_key" ON "PortalMediaItem"("ownerId", "tag");
CREATE INDEX IF NOT EXISTS "PortalMediaItem_ownerId_folderId_createdAt_idx" ON "PortalMediaItem"("ownerId", "folderId", "createdAt");
