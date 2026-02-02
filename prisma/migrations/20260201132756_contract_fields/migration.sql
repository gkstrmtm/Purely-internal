-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContractDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentOutcomeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priceCents" INTEGER NOT NULL,
    "setupFeeCents" INTEGER NOT NULL DEFAULT 0,
    "monthlyFeeCents" INTEGER NOT NULL DEFAULT 0,
    "termMonths" INTEGER NOT NULL DEFAULT 0,
    "servicesJson" JSONB,
    "servicesOther" TEXT,
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
INSERT INTO "new_ContractDraft" ("aiDocId", "appointmentOutcomeId", "clientEmail", "createdAt", "id", "priceCents", "services", "status", "submittedByUserId", "terms", "updatedAt") SELECT "aiDocId", "appointmentOutcomeId", "clientEmail", "createdAt", "id", "priceCents", "services", "status", "submittedByUserId", "terms", "updatedAt" FROM "ContractDraft";
DROP TABLE "ContractDraft";
ALTER TABLE "new_ContractDraft" RENAME TO "ContractDraft";
CREATE UNIQUE INDEX "ContractDraft_appointmentOutcomeId_key" ON "ContractDraft"("appointmentOutcomeId");
CREATE INDEX "ContractDraft_status_idx" ON "ContractDraft"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
