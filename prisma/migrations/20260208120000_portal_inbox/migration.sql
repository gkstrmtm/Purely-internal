-- CreateEnum
CREATE TYPE "PortalInboxChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "PortalInboxDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "PortalInboxThread" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "channel" "PortalInboxChannel" NOT NULL,
    "threadKey" TEXT NOT NULL,
    "peerAddress" TEXT NOT NULL,
    "peerKey" TEXT NOT NULL,
    "subject" TEXT,
    "subjectKey" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessagePreview" TEXT NOT NULL DEFAULT '',
    "lastMessageDirection" "PortalInboxDirection" NOT NULL DEFAULT 'IN',
    "lastMessageFrom" TEXT NOT NULL DEFAULT '',
    "lastMessageTo" TEXT NOT NULL DEFAULT '',
    "lastMessageSubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalInboxThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalInboxMessage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "channel" "PortalInboxChannel" NOT NULL,
    "direction" "PortalInboxDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalInboxThread_ownerId_channel_threadKey_key" ON "PortalInboxThread"("ownerId", "channel", "threadKey");

-- CreateIndex
CREATE INDEX "PortalInboxThread_ownerId_channel_lastMessageAt_idx" ON "PortalInboxThread"("ownerId", "channel", "lastMessageAt");

-- CreateIndex
CREATE INDEX "PortalInboxThread_ownerId_channel_peerKey_idx" ON "PortalInboxThread"("ownerId", "channel", "peerKey");

-- CreateIndex
CREATE INDEX "PortalInboxMessage_threadId_createdAt_idx" ON "PortalInboxMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalInboxMessage_ownerId_channel_createdAt_idx" ON "PortalInboxMessage"("ownerId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "PortalInboxMessage_providerMessageId_idx" ON "PortalInboxMessage"("providerMessageId");

-- AddForeignKey
ALTER TABLE "PortalInboxThread" ADD CONSTRAINT "PortalInboxThread_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInboxMessage" ADD CONSTRAINT "PortalInboxMessage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInboxMessage" ADD CONSTRAINT "PortalInboxMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "PortalInboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
