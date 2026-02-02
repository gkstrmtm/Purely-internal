-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DIALER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "website" TEXT,
    "location" TEXT,
    "niche" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LeadAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    CONSTRAINT "LeadAssignment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeadAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Script_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Doc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Doc_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dialerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "notes" TEXT,
    "followUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcriptDocId" TEXT,
    CONSTRAINT "CallLog_dialerId_fkey" FOREIGN KEY ("dialerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CallLog_transcriptDocId_fkey" FOREIGN KEY ("transcriptDocId") REFERENCES "Doc" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallRecording" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callLogId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallRecording_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "CallLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvailabilityBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "setterId" TEXT NOT NULL,
    "closerId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "callLogId" TEXT,
    "prepDocId" TEXT,
    "loomUrl" TEXT,
    CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_setterId_fkey" FOREIGN KEY ("setterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_closerId_fkey" FOREIGN KEY ("closerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "CallLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_prepDocId_fkey" FOREIGN KEY ("prepDocId") REFERENCES "Doc" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppointmentOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "revenueCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppointmentOutcome_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentOutcomeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priceCents" INTEGER NOT NULL,
    "terms" TEXT NOT NULL,
    "services" TEXT NOT NULL,
    "clientEmail" TEXT,
    "aiDocId" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractDraft_aiDocId_fkey" FOREIGN KEY ("aiDocId") REFERENCES "Doc" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ContractDraft_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContractDraft_appointmentOutcomeId_fkey" FOREIGN KEY ("appointmentOutcomeId") REFERENCES "AppointmentOutcome" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractDraftId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_contractDraftId_fkey" FOREIGN KEY ("contractDraftId") REFERENCES "ContractDraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Approval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LeadAssignment_userId_idx" ON "LeadAssignment"("userId");

-- CreateIndex
CREATE INDEX "LeadAssignment_leadId_idx" ON "LeadAssignment"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAssignment_leadId_releasedAt_key" ON "LeadAssignment"("leadId", "releasedAt");

-- CreateIndex
CREATE INDEX "Script_ownerId_idx" ON "Script"("ownerId");

-- CreateIndex
CREATE INDEX "Doc_ownerId_idx" ON "Doc"("ownerId");

-- CreateIndex
CREATE INDEX "CallLog_dialerId_idx" ON "CallLog"("dialerId");

-- CreateIndex
CREATE INDEX "CallLog_leadId_idx" ON "CallLog"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CallRecording_callLogId_key" ON "CallRecording"("callLogId");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_userId_startAt_idx" ON "AvailabilityBlock"("userId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_callLogId_key" ON "Appointment"("callLogId");

-- CreateIndex
CREATE INDEX "Appointment_closerId_startAt_idx" ON "Appointment"("closerId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_setterId_startAt_idx" ON "Appointment"("setterId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentOutcome_appointmentId_key" ON "AppointmentOutcome"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDraft_appointmentOutcomeId_key" ON "ContractDraft"("appointmentOutcomeId");

-- CreateIndex
CREATE INDEX "ContractDraft_status_idx" ON "ContractDraft"("status");

-- CreateIndex
CREATE INDEX "Approval_contractDraftId_idx" ON "Approval"("contractDraftId");

-- CreateIndex
CREATE INDEX "Approval_reviewerId_idx" ON "Approval"("reviewerId");
