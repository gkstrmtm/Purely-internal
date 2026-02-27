-- CreateTable
CREATE TABLE "AdsAudienceProfile" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetingJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsAudienceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdsAudienceProfile_createdById_name_key" ON "AdsAudienceProfile"("createdById", "name");

-- CreateIndex
CREATE INDEX "AdsAudienceProfile_createdById_updatedAt_idx" ON "AdsAudienceProfile"("createdById", "updatedAt");

-- AddForeignKey
ALTER TABLE "AdsAudienceProfile" ADD CONSTRAINT "AdsAudienceProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
