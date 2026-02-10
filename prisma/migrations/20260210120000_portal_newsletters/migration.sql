-- CreateEnum
CREATE TYPE "ClientNewsletterKind" AS ENUM ('EXTERNAL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ClientNewsletterStatus" AS ENUM ('DRAFT', 'READY', 'SENT');

-- CreateEnum
CREATE TYPE "PortalNewsletterGenerationSource" AS ENUM ('CRON', 'GENERATE_NOW');

-- CreateEnum
CREATE TYPE "PortalNewsletterSendChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "ClientNewsletter" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kind" "ClientNewsletterKind" NOT NULL,
    "status" "ClientNewsletterStatus" NOT NULL DEFAULT 'DRAFT',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "smsText" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNewsletter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalNewsletterGenerationEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "newsletterId" TEXT,
    "source" "PortalNewsletterGenerationSource" NOT NULL,
    "chargedCredits" INTEGER NOT NULL DEFAULT 1,
    "kind" "ClientNewsletterKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalNewsletterGenerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalNewsletterSendEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "newsletterId" TEXT NOT NULL,
    "channel" "PortalNewsletterSendChannel" NOT NULL,
    "kind" "ClientNewsletterKind" NOT NULL,
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalNewsletterSendEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientNewsletter_siteId_kind_slug_key" ON "ClientNewsletter"("siteId", "kind", "slug");

-- CreateIndex
CREATE INDEX "ClientNewsletter_siteId_kind_createdAt_idx" ON "ClientNewsletter"("siteId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ClientNewsletter_siteId_kind_status_sentAt_idx" ON "ClientNewsletter"("siteId", "kind", "status", "sentAt");

-- CreateIndex
CREATE INDEX "PortalNewsletterGenerationEvent_ownerId_createdAt_idx" ON "PortalNewsletterGenerationEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalNewsletterGenerationEvent_siteId_createdAt_idx" ON "PortalNewsletterGenerationEvent"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalNewsletterGenerationEvent_newsletterId_idx" ON "PortalNewsletterGenerationEvent"("newsletterId");

-- CreateIndex
CREATE INDEX "PortalNewsletterSendEvent_ownerId_createdAt_idx" ON "PortalNewsletterSendEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalNewsletterSendEvent_siteId_createdAt_idx" ON "PortalNewsletterSendEvent"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalNewsletterSendEvent_newsletterId_createdAt_idx" ON "PortalNewsletterSendEvent"("newsletterId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientNewsletter" ADD CONSTRAINT "ClientNewsletter_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientBlogSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalNewsletterGenerationEvent" ADD CONSTRAINT "PortalNewsletterGenerationEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalNewsletterGenerationEvent" ADD CONSTRAINT "PortalNewsletterGenerationEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientBlogSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalNewsletterGenerationEvent" ADD CONSTRAINT "PortalNewsletterGenerationEvent_newsletterId_fkey" FOREIGN KEY ("newsletterId") REFERENCES "ClientNewsletter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalNewsletterSendEvent" ADD CONSTRAINT "PortalNewsletterSendEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalNewsletterSendEvent" ADD CONSTRAINT "PortalNewsletterSendEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientBlogSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalNewsletterSendEvent" ADD CONSTRAINT "PortalNewsletterSendEvent_newsletterId_fkey" FOREIGN KEY ("newsletterId") REFERENCES "ClientNewsletter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
