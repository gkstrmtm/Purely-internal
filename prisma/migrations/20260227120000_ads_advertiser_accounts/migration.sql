-- CreateEnum
CREATE TYPE "AdsLedgerKind" AS ENUM ('TOPUP', 'SPEND', 'REFUND');

-- CreateTable
CREATE TABLE "AdsAdvertiserAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsAdvertiserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsAdvertiserLedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "AdsLedgerKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "campaignId" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsAdvertiserLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdsAdvertiserAccount_userId_key" ON "AdsAdvertiserAccount"("userId");

-- CreateIndex
CREATE INDEX "AdsAdvertiserAccount_balanceCents_idx" ON "AdsAdvertiserAccount"("balanceCents");

-- CreateIndex
CREATE INDEX "AdsAdvertiserLedgerEntry_accountId_createdAt_idx" ON "AdsAdvertiserLedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AdsAdvertiserLedgerEntry_campaignId_createdAt_idx" ON "AdsAdvertiserLedgerEntry"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AdsAdvertiserLedgerEntry_kind_createdAt_idx" ON "AdsAdvertiserLedgerEntry"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "AdsAdvertiserAccount" ADD CONSTRAINT "AdsAdvertiserAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsAdvertiserLedgerEntry" ADD CONSTRAINT "AdsAdvertiserLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdsAdvertiserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
