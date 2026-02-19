DO $$
BEGIN
  CREATE TYPE "ClientPortalVariant" AS ENUM ('PORTAL', 'CREDIT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "clientPortalVariant" "ClientPortalVariant" NOT NULL DEFAULT 'PORTAL';
