-- CreateTable
CREATE TABLE "PortalTargetingBucket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalTargetingBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalTargetingBucketMember" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalTargetingBucketMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalTargetingBucket_name_key" ON "PortalTargetingBucket"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PortalTargetingBucketMember_bucketId_ownerId_key" ON "PortalTargetingBucketMember"("bucketId", "ownerId");

-- CreateIndex
CREATE INDEX "PortalTargetingBucketMember_ownerId_idx" ON "PortalTargetingBucketMember"("ownerId");

-- AddForeignKey
ALTER TABLE "PortalTargetingBucketMember" ADD CONSTRAINT "PortalTargetingBucketMember_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "PortalTargetingBucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalTargetingBucketMember" ADD CONSTRAINT "PortalTargetingBucketMember_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
