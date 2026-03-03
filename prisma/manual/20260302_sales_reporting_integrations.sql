-- Sales reporting integrations (adds only)
-- Creates:
--  - enum "SalesReportingProvider"
--  - table "SalesReportingSettings"
--  - table "SalesReportingCredential"

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $$
BEGIN
  CREATE TYPE "SalesReportingProvider" AS ENUM (
    'STRIPE',
    'AUTHORIZENET',
    'BRAINTREE',
    'RAZORPAY',
    'PAYSTACK',
    'FLUTTERWAVE',
    'MOLLIE',
    'MERCADOPAGO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SalesReportingSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activeProvider" "SalesReportingProvider",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesReportingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesReportingSettings_userId_key" ON "SalesReportingSettings"("userId");
CREATE INDEX IF NOT EXISTS "SalesReportingSettings_userId_updatedAt_idx" ON "SalesReportingSettings"("userId", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalesReportingSettings_userId_fkey'
  ) THEN
    ALTER TABLE "SalesReportingSettings"
      ADD CONSTRAINT "SalesReportingSettings_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SalesReportingCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "SalesReportingProvider" NOT NULL,
  "ciphertextB64" TEXT NOT NULL,
  "ivB64" TEXT NOT NULL,
  "authTagB64" TEXT NOT NULL,
  "displayHint" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesReportingCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesReportingCredential_userId_provider_key" ON "SalesReportingCredential"("userId", "provider");
CREATE INDEX IF NOT EXISTS "SalesReportingCredential_userId_provider_idx" ON "SalesReportingCredential"("userId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalesReportingCredential_userId_fkey'
  ) THEN
    ALTER TABLE "SalesReportingCredential"
      ADD CONSTRAINT "SalesReportingCredential_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
