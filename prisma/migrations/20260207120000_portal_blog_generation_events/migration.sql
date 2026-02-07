-- CreateEnum
CREATE TYPE "PortalBlogGenerationSource" AS ENUM ('CRON', 'GENERATE_NOW', 'DRAFT_GENERATE');

-- CreateTable
CREATE TABLE "PortalBlogGenerationEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "postId" TEXT,
    "source" "PortalBlogGenerationSource" NOT NULL,
    "chargedCredits" INTEGER NOT NULL DEFAULT 1,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalBlogGenerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalBlogGenerationEvent_ownerId_createdAt_idx" ON "PortalBlogGenerationEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalBlogGenerationEvent_siteId_createdAt_idx" ON "PortalBlogGenerationEvent"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalBlogGenerationEvent_postId_idx" ON "PortalBlogGenerationEvent"("postId");

-- AddForeignKey
ALTER TABLE "PortalBlogGenerationEvent" ADD CONSTRAINT "PortalBlogGenerationEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalBlogGenerationEvent" ADD CONSTRAINT "PortalBlogGenerationEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ClientBlogSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalBlogGenerationEvent" ADD CONSTRAINT "PortalBlogGenerationEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClientBlogPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
