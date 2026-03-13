-- Support externally-stored media (e.g. Vercel Blob) for large uploads.
--
-- Idempotent migration: safe to run multiple times.

ALTER TABLE "PortalMediaItem"
  ADD COLUMN IF NOT EXISTS "storageUrl" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = '"PortalMediaItem"'::regclass
      AND attname = 'bytes'
      AND attnotnull = true
  ) THEN
    ALTER TABLE "PortalMediaItem" ALTER COLUMN "bytes" DROP NOT NULL;
  END IF;
END $$;
