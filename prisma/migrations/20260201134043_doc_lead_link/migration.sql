-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Doc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Doc_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Doc_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Doc" ("content", "createdAt", "id", "kind", "ownerId", "title", "updatedAt") SELECT "content", "createdAt", "id", "kind", "ownerId", "title", "updatedAt" FROM "Doc";
DROP TABLE "Doc";
ALTER TABLE "new_Doc" RENAME TO "Doc";
CREATE INDEX "Doc_ownerId_idx" ON "Doc"("ownerId");
CREATE INDEX "Doc_leadId_idx" ON "Doc"("leadId");
CREATE UNIQUE INDEX "Doc_ownerId_leadId_kind_key" ON "Doc"("ownerId", "leadId", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
