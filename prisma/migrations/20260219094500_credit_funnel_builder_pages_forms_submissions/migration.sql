-- CreateTable
CREATE TABLE "CreditFunnelPage" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditFunnelPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditFormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditFunnelBuilderSettings" (
    "ownerId" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditFunnelBuilderSettings_pkey" PRIMARY KEY ("ownerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditFunnelPage_funnelId_slug_key" ON "CreditFunnelPage"("funnelId", "slug");

-- CreateIndex
CREATE INDEX "CreditFunnelPage_funnelId_sortOrder_idx" ON "CreditFunnelPage"("funnelId", "sortOrder");

-- CreateIndex
CREATE INDEX "CreditFormSubmission_formId_createdAt_idx" ON "CreditFormSubmission"("formId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditFunnelPage" ADD CONSTRAINT "CreditFunnelPage_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "CreditFunnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditFormSubmission" ADD CONSTRAINT "CreditFormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CreditForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditFunnelBuilderSettings" ADD CONSTRAINT "CreditFunnelBuilderSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
