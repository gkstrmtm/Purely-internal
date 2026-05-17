import { prisma } from "@/lib/db";
import { normalizeEmployeeInviteRole, type EmployeeInviteRole } from "@/lib/employeeInviteRoles";

type DbLike = {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
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
      "invitedRole" TEXT NOT NULL DEFAULT 'DIALER',
      "expiresAt" TIMESTAMP(3),
      "usedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,

    `ALTER TABLE "EmployeeInvite" ADD COLUMN IF NOT EXISTS "invitedRole" TEXT NOT NULL DEFAULT 'DIALER';`,

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

export async function getEmployeeInviteRoleByCode(code: string, db: DbLike = prisma): Promise<EmployeeInviteRole> {
  await ensureEmployeeInvitesSchema(db);
  const rows = await db.$queryRawUnsafe<Array<{ invitedRole: string | null }>>(
    `SELECT "invitedRole"
       FROM "EmployeeInvite"
      WHERE "code" = $1
      LIMIT 1`,
    code,
  );
  return normalizeEmployeeInviteRole(rows[0]?.invitedRole);
}

export async function getEmployeeInviteRoleById(id: string, db: DbLike = prisma): Promise<EmployeeInviteRole> {
  await ensureEmployeeInvitesSchema(db);
  const rows = await db.$queryRawUnsafe<Array<{ invitedRole: string | null }>>(
    `SELECT "invitedRole"
       FROM "EmployeeInvite"
      WHERE "id" = $1
      LIMIT 1`,
    id,
  );
  return normalizeEmployeeInviteRole(rows[0]?.invitedRole);
}

export async function getEmployeeInviteRolesByIds(ids: string[], db: DbLike = prisma) {
  await ensureEmployeeInvitesSchema(db);
  if (ids.length === 0) return new Map<string, EmployeeInviteRole>();

  const rows = await db.$queryRawUnsafe<Array<{ id: string; invitedRole: string | null }>>(
    `SELECT "id", "invitedRole"
       FROM "EmployeeInvite"
      WHERE "id" = ANY($1)`,
    ids,
  );

  return new Map(rows.map((row) => [row.id, normalizeEmployeeInviteRole(row.invitedRole)]));
}
