-- Manual DB patch (Postgres)
-- Adds manager-generated employee invite codes for /signup.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS "EmployeeInvite" (
  "id" TEXT NOT NULL PRIMARY KEY,

  "createdById" TEXT NOT NULL,
  "usedById" TEXT,

  "code" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeInvite_code_key" UNIQUE ("code"),
  CONSTRAINT "EmployeeInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EmployeeInvite_createdById_createdAt_idx" ON "EmployeeInvite"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeInvite_usedAt_idx" ON "EmployeeInvite"("usedAt");
