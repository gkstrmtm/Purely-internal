-- CreateEnum
CREATE TYPE "CreditFunnelStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CreditFormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CreditCustomDomainStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateTable
CREATE TABLE "CreditFunnel" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CreditFunnelStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditFunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditForm" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CreditFormStatus" NOT NULL DEFAULT 'DRAFT',
    "schemaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCustomDomain" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "CreditCustomDomainStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditFunnel_slug_key" ON "CreditFunnel"("slug");

-- CreateIndex
CREATE INDEX "CreditFunnel_ownerId_updatedAt_idx" ON "CreditFunnel"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditForm_slug_key" ON "CreditForm"("slug");

-- CreateIndex
CREATE INDEX "CreditForm_ownerId_updatedAt_idx" ON "CreditForm"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCustomDomain_ownerId_domain_key" ON "CreditCustomDomain"("ownerId", "domain");

-- CreateIndex
CREATE INDEX "CreditCustomDomain_ownerId_updatedAt_idx" ON "CreditCustomDomain"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CreditFunnel" ADD CONSTRAINT "CreditFunnel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditForm" ADD CONSTRAINT "CreditForm_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCustomDomain" ADD CONSTRAINT "CreditCustomDomain_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
