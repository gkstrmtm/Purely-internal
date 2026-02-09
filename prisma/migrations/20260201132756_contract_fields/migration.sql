-- Add fields to ContractDraft (PostgreSQL)
ALTER TABLE "ContractDraft" ADD COLUMN "setupFeeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ContractDraft" ADD COLUMN "monthlyFeeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ContractDraft" ADD COLUMN "termMonths" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ContractDraft" ADD COLUMN "servicesJson" JSONB;
ALTER TABLE "ContractDraft" ADD COLUMN "servicesOther" TEXT;
