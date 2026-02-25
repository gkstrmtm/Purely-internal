-- CreateEnum
CREATE TYPE "PortalAdPlacement" AS ENUM ('SIDEBAR_BANNER', 'BILLING_SPONSORED', 'FULLSCREEN_REWARD');

-- CreateEnum
CREATE TYPE "PortalAdEventKind" AS ENUM ('IMPRESSION', 'CLAIM');

-- CreateTable
CREATE TABLE "PortalAdCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "placement" "PortalAdPlacement" NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "targetJson" JSONB,
    "creativeJson" JSONB NOT NULL,
    "rewardJson" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAdCampaignAssignment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAdCampaignAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAdCampaignEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "PortalAdEventKind" NOT NULL,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAdCampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalAdCampaign_enabled_placement_idx" ON "PortalAdCampaign"("enabled", "placement");

-- CreateIndex
CREATE INDEX "PortalAdCampaign_placement_priority_idx" ON "PortalAdCampaign"("placement", "priority");

-- CreateIndex
CREATE INDEX "PortalAdCampaign_startAt_idx" ON "PortalAdCampaign"("startAt");

-- CreateIndex
CREATE INDEX "PortalAdCampaign_endAt_idx" ON "PortalAdCampaign"("endAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAdCampaignAssignment_campaignId_ownerId_key" ON "PortalAdCampaignAssignment"("campaignId", "ownerId");

-- CreateIndex
CREATE INDEX "PortalAdCampaignAssignment_ownerId_idx" ON "PortalAdCampaignAssignment"("ownerId");

-- CreateIndex
CREATE INDEX "PortalAdCampaignEvent_campaignId_ownerId_kind_createdAt_idx" ON "PortalAdCampaignEvent"("campaignId", "ownerId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "PortalAdCampaignEvent_ownerId_createdAt_idx" ON "PortalAdCampaignEvent"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "PortalAdCampaign" ADD CONSTRAINT "PortalAdCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAdCampaign" ADD CONSTRAINT "PortalAdCampaign_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAdCampaignAssignment" ADD CONSTRAINT "PortalAdCampaignAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PortalAdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAdCampaignAssignment" ADD CONSTRAINT "PortalAdCampaignAssignment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAdCampaignEvent" ADD CONSTRAINT "PortalAdCampaignEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PortalAdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAdCampaignEvent" ADD CONSTRAINT "PortalAdCampaignEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
