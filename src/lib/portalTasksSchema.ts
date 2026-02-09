import { prisma } from "@/lib/db";

export async function ensurePortalTasksSchema() {
  // Drift-hardening: create tables/types if missing.
  // NOTE: keep SQL Postgres-safe and idempotent.
  const statements: string[] = [
    // Enums
    `DO $$ BEGIN
      CREATE TYPE "PortalAccountRole" AS ENUM ('OWNER','ADMIN','MEMBER');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN
      CREATE TYPE "PortalTaskStatus" AS ENUM ('OPEN','DONE','CANCELED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

    // PortalAccountMember
    `CREATE TABLE IF NOT EXISTS "PortalAccountMember" (
      "id" TEXT PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" "PortalAccountRole" NOT NULL DEFAULT 'MEMBER',
      "permissionsJson" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PortalAccountMember_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "PortalAccountMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalAccountMember_ownerId_userId_key" ON "PortalAccountMember"("ownerId","userId");`,
    `CREATE INDEX IF NOT EXISTS "PortalAccountMember_ownerId_idx" ON "PortalAccountMember"("ownerId");`,
    `CREATE INDEX IF NOT EXISTS "PortalAccountMember_userId_idx" ON "PortalAccountMember"("userId");`,

    // PortalAccountInvite
    `CREATE TABLE IF NOT EXISTS "PortalAccountInvite" (
      "id" TEXT PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "role" "PortalAccountRole" NOT NULL DEFAULT 'MEMBER',
      "permissionsJson" JSONB,
      "token" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "acceptedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PortalAccountInvite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalAccountInvite_token_key" ON "PortalAccountInvite"("token");`,
    `CREATE INDEX IF NOT EXISTS "PortalAccountInvite_ownerId_createdAt_idx" ON "PortalAccountInvite"("ownerId","createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalAccountInvite_email_idx" ON "PortalAccountInvite"("email");`,

    // PortalTask
    `CREATE TABLE IF NOT EXISTS "PortalTask" (
      "id" TEXT PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "status" "PortalTaskStatus" NOT NULL DEFAULT 'OPEN',
      "assignedToUserId" TEXT,
      "dueAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "PortalTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "PortalTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS "PortalTask_ownerId_status_updatedAt_idx" ON "PortalTask"("ownerId","status","updatedAt");`,
    `CREATE INDEX IF NOT EXISTS "PortalTask_ownerId_assignedToUserId_status_idx" ON "PortalTask"("ownerId","assignedToUserId","status");`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
}
