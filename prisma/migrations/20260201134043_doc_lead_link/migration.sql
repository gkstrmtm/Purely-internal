-- Add lead link to Doc (PostgreSQL)
ALTER TABLE "Doc" ADD COLUMN "leadId" TEXT;
ALTER TABLE "Doc" ADD CONSTRAINT "Doc_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Doc_leadId_idx" ON "Doc"("leadId");
CREATE UNIQUE INDEX "Doc_ownerId_leadId_kind_key" ON "Doc"("ownerId", "leadId", "kind");
