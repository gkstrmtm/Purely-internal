import { prisma } from "@/lib/db";

type DbLike = {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
};

export async function ensureEmployeeInvitesSchema(db: DbLike = prisma) {
  // Drift-hardening: create table/indexes/constraints if missing.
  // Keep SQL Postgres-safe and idempotent.
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS "EmployeeInvite" (
      "id" TEXT PRIMARY KEY,
      "createdById" TEXT NOT NULL,
      "usedById" TEXT,
      "code" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3),
      "usedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeInvite_code_key" ON "EmployeeInvite"("code");`,
    `CREATE INDEX IF NOT EXISTS "EmployeeInvite_createdById_createdAt_idx" ON "EmployeeInvite"("createdById","createdAt");`,
    `CREATE INDEX IF NOT EXISTS "EmployeeInvite_usedAt_idx" ON "EmployeeInvite"("usedAt");`,

    `DO $$ BEGIN
      ALTER TABLE "EmployeeInvite" ADD CONSTRAINT "EmployeeInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

    `DO $$ BEGIN
      ALTER TABLE "EmployeeInvite" ADD CONSTRAINT "EmployeeInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  ];

  for (const sql of statements) {
    await db.$executeRawUnsafe(sql);
  }
}
