-- Add lead assignee (idempotent).

ALTER TABLE "PortalLead" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PortalLead_assignedToUserId_fkey'
  ) THEN
    ALTER TABLE "PortalLead"
      ADD CONSTRAINT "PortalLead_assignedToUserId_fkey"
      FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_assignedToUserId_idx" ON "PortalLead"("ownerId", "assignedToUserId");
