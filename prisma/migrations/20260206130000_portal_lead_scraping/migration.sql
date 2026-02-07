-- CreateEnum
CREATE TYPE "PortalLeadScrapeKind" AS ENUM ('B2B', 'B2C');

-- CreateEnum
CREATE TYPE "PortalLeadSource" AS ENUM ('GOOGLE_PLACES');

-- CreateTable
CREATE TABLE "PortalLeadScrapeRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "PortalLeadScrapeKind" NOT NULL,
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "chargedCredits" INTEGER NOT NULL DEFAULT 0,
    "refundedCredits" INTEGER NOT NULL DEFAULT 0,
    "settingsJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLeadScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalLead" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "source" "PortalLeadSource" NOT NULL DEFAULT 'GOOGLE_PLACES',
    "kind" "PortalLeadScrapeKind" NOT NULL DEFAULT 'B2B',
    "businessName" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "niche" TEXT,
    "placeId" TEXT,
    "dataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalLeadScrapeRun_ownerId_createdAt_idx" ON "PortalLeadScrapeRun"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalLeadScrapeRun_ownerId_kind_createdAt_idx" ON "PortalLeadScrapeRun"("ownerId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "PortalLead_ownerId_createdAt_idx" ON "PortalLead"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalLead_ownerId_kind_createdAt_idx" ON "PortalLead"("ownerId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalLead_ownerId_placeId_key" ON "PortalLead"("ownerId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalLead_ownerId_phone_key" ON "PortalLead"("ownerId", "phone");

-- AddForeignKey
ALTER TABLE "PortalLeadScrapeRun" ADD CONSTRAINT "PortalLeadScrapeRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalLead" ADD CONSTRAINT "PortalLead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
