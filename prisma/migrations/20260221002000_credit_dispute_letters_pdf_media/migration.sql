-- Credit dispute letters: store generated PDF in Media Library

ALTER TABLE "CreditDisputeLetter" ADD COLUMN IF NOT EXISTS "pdfMediaItemId" TEXT;
ALTER TABLE "CreditDisputeLetter" ADD COLUMN IF NOT EXISTS "pdfGeneratedAt" TIMESTAMP(3);

-- One PDF per letter (optional 1:1)
CREATE UNIQUE INDEX IF NOT EXISTS "CreditDisputeLetter_pdfMediaItemId_key" ON "CreditDisputeLetter"("pdfMediaItemId");

-- Foreign key to Media Library item (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CreditDisputeLetter_pdfMediaItemId_fkey'
  ) THEN
    ALTER TABLE "CreditDisputeLetter"
      ADD CONSTRAINT "CreditDisputeLetter_pdfMediaItemId_fkey"
      FOREIGN KEY ("pdfMediaItemId") REFERENCES "PortalMediaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CreditDisputeLetter_pdfMediaItemId_idx" ON "CreditDisputeLetter"("pdfMediaItemId");
