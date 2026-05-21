-- CreateTable
CREATE TABLE "PortalBookingExternalLinkEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "siteId" TEXT,
    "contactId" TEXT,
    "portalVariant" "ClientPortalVariant",
    "handoffMode" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerLabel" TEXT NOT NULL,
    "externalUrlHost" TEXT NOT NULL,
    "sourceRoute" TEXT,
    "sourceCampaign" TEXT,
    "referrerHost" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "metaJson" JSONB,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalBookingExternalLinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalBookingExternalLinkEvent_ownerId_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "clickedAt");

-- CreateIndex
CREATE INDEX "PortalBookingExternalLinkEvent_ownerId_siteId_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "siteId", "clickedAt");

-- CreateIndex
CREATE INDEX "PortalBookingExternalLinkEvent_ownerId_contactId_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "contactId", "clickedAt");

-- CreateIndex
CREATE INDEX "PortalBookingExternalLinkEvent_ownerId_providerKey_clickedAt_idx" ON "PortalBookingExternalLinkEvent"("ownerId", "providerKey", "clickedAt");

-- AddForeignKey
ALTER TABLE "PortalBookingExternalLinkEvent" ADD CONSTRAINT "PortalBookingExternalLinkEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalBookingExternalLinkEvent" ADD CONSTRAINT "PortalBookingExternalLinkEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "PortalBookingSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalBookingExternalLinkEvent" ADD CONSTRAINT "PortalBookingExternalLinkEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PortalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;