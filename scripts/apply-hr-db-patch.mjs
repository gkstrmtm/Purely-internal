import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!key) continue;
    process.env[key] = val;
  }
}

function loadEnv() {
  const cwd = process.cwd();
  loadEnvFromFile(path.join(cwd, ".env"));
  loadEnvFromFile(path.join(cwd, ".env.local"));
}

function parseUrl(raw) {
  try {
    return new URL(String(raw || "").trim());
  } catch {
    return null;
  }
}

function isRemoteSupabase(u) {
  const host = String(u?.host || "").toLowerCase();
  if (!host) return false;
  if (host.includes("localhost") || host.startsWith("127.") || host.startsWith("0.0.0.0")) return false;
  return host.includes("supabase.") || host.includes("supabase.co") || host.includes("supabase.com");
}

function guardRemoteDb() {
  const allow = String(process.env.ALLOW_PROD_DB_MUTATIONS || "").trim() === "1";
  const db = parseUrl(process.env.DATABASE_URL);
  const direct = parseUrl(process.env.DIRECT_URL);

  const remote = (db && isRemoteSupabase(db)) || (direct && isRemoteSupabase(direct));
  if (remote && !allow) {
    const dbHost = db?.host ? `DATABASE_URL host: ${db.host}` : "DATABASE_URL host: (unparseable or missing)";
    const directHost = direct?.host ? `DIRECT_URL host: ${direct.host}` : "DIRECT_URL host: (unparseable or missing)";

    console.error("\nDB GUARD: blocked a potentially destructive DB command.\n");
    console.error("This patch appears to target a remote Supabase database.");
    console.error(dbHost);
    console.error(directHost);
    console.error("\nIf you really intend to run this against a remote DB, re-run with:");
    console.error("  ALLOW_PROD_DB_MUTATIONS=1 node scripts/apply-hr-db-patch.mjs\n");
    process.exit(2);
  }
}

loadEnv();

guardRemoteDb();

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Missing DIRECT_URL/DATABASE_URL. Set env vars or add them to .env/.env.local.");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl },
  },
  log: [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
  ],
});

prisma.$on("warn", (e) => {
  console.warn("[prisma warn]", e.message);
});

prisma.$on("error", (e) => {
  console.error("[prisma error]", e.message);
});

const statements = [
  // Fail fast on locks/hangs.
  "SET lock_timeout = '5s'",
  "SET statement_timeout = '30s'",

  // Role enum: add HR.
  `DO $$
BEGIN
  BEGIN
    ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;`,

  // Enums.
  `DO $$
BEGIN
  CREATE TYPE "HrCandidateStatus" AS ENUM ('APPLIED','SCREENING','INTERVIEWING','OFFERED','HIRED','REJECTED','WITHDRAWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,
  `DO $$
BEGIN
  CREATE TYPE "HrScreeningDecision" AS ENUM ('PASS','FAIL','MAYBE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,
  `DO $$
BEGIN
  CREATE TYPE "HrInterviewStatus" AS ENUM ('SCHEDULED','COMPLETED','NO_SHOW','CANCELED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,
  `DO $$
BEGIN
  CREATE TYPE "HrHiringDecision" AS ENUM ('HIRE','NO_HIRE','HOLD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,
  `DO $$
BEGIN
  CREATE TYPE "HrFollowUpChannel" AS ENUM ('EMAIL','SMS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,
  `DO $$
BEGIN
  CREATE TYPE "HrFollowUpStatus" AS ENUM ('PENDING','SENDING','SENT','FAILED','CANCELED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,

  // Tables.
  `CREATE TABLE IF NOT EXISTS "HrCandidate" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "source" TEXT,
  "notes" TEXT,
  "status" "HrCandidateStatus" NOT NULL DEFAULT 'APPLIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidate_pkey" PRIMARY KEY ("id")
);`,

  // Align with Prisma behavior (@updatedAt is written by Prisma).
  `ALTER TABLE IF EXISTS "HrCandidate" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

  `CREATE TABLE IF NOT EXISTS "HrCandidateScreening" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "decision" "HrScreeningDecision",
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateScreening_pkey" PRIMARY KEY ("id")
);`,

  `CREATE TABLE IF NOT EXISTS "HrCandidateInterview" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "HrInterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
  "connectRoomId" TEXT,
  "meetingJoinUrl" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateInterview_pkey" PRIMARY KEY ("id")
);`,

  `ALTER TABLE IF EXISTS "HrCandidateInterview" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

  `CREATE TABLE IF NOT EXISTS "HrCandidateEvaluation" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "interviewId" TEXT,
  "decision" "HrHiringDecision",
  "ratingOverall" INTEGER,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateEvaluation_pkey" PRIMARY KEY ("id")
);`,

  `CREATE TABLE IF NOT EXISTS "HrCandidateFollowUp" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "channel" "HrFollowUpChannel" NOT NULL,
  "toAddress" TEXT NOT NULL,
  "subject" TEXT,
  "bodyText" TEXT NOT NULL,
  "sendAt" TIMESTAMP(3) NOT NULL,
  "status" "HrFollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateFollowUp_pkey" PRIMARY KEY ("id")
);`,

  `CREATE TABLE IF NOT EXISTS "HrCandidateInvite" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "employeeInviteId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrCandidateInvite_pkey" PRIMARY KEY ("id")
);`,

  // Columns (idempotent, in case tables already exist without them).
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "fullName" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "email" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "phone" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "source" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "notes" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "status" "HrCandidateStatus";`,
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE IF EXISTS "HrCandidate" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  `ALTER TABLE IF EXISTS "HrCandidateScreening" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateScreening" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);`,
  `ALTER TABLE IF EXISTS "HrCandidateScreening" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);`,
  `ALTER TABLE IF EXISTS "HrCandidateScreening" ADD COLUMN IF NOT EXISTS "decision" "HrScreeningDecision";`,
  `ALTER TABLE IF EXISTS "HrCandidateScreening" ADD COLUMN IF NOT EXISTS "notes" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateScreening" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateScreening" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);`,
  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "status" "HrInterviewStatus";`,
  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "connectRoomId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "meetingJoinUrl" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE IF EXISTS "HrCandidateInterview" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  `ALTER TABLE IF EXISTS "HrCandidateEvaluation" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateEvaluation" ADD COLUMN IF NOT EXISTS "interviewId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateEvaluation" ADD COLUMN IF NOT EXISTS "decision" "HrHiringDecision";`,
  `ALTER TABLE IF EXISTS "HrCandidateEvaluation" ADD COLUMN IF NOT EXISTS "ratingOverall" INTEGER;`,
  `ALTER TABLE IF EXISTS "HrCandidateEvaluation" ADD COLUMN IF NOT EXISTS "notes" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateEvaluation" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateEvaluation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "channel" "HrFollowUpChannel";`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "toAddress" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "subject" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "bodyText" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "sendAt" TIMESTAMP(3);`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "status" "HrFollowUpStatus";`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "lastError" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateFollowUp" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  `ALTER TABLE IF EXISTS "HrCandidateInvite" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateInvite" ADD COLUMN IF NOT EXISTS "employeeInviteId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateInvite" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;`,
  `ALTER TABLE IF EXISTS "HrCandidateInvite" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  // Indexes.
  `CREATE INDEX IF NOT EXISTS "HrCandidate_status_createdAt_idx" ON "HrCandidate" ("status", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "HrCandidate_createdAt_idx" ON "HrCandidate" ("createdAt");`,

  `CREATE INDEX IF NOT EXISTS "HrCandidateScreening_candidateId_createdAt_idx" ON "HrCandidateScreening" ("candidateId", "createdAt");`,

  `CREATE INDEX IF NOT EXISTS "HrCandidateInterview_candidateId_scheduledAt_idx" ON "HrCandidateInterview" ("candidateId", "scheduledAt");`,
  `CREATE INDEX IF NOT EXISTS "HrCandidateInterview_scheduledAt_idx" ON "HrCandidateInterview" ("scheduledAt");`,

  `CREATE INDEX IF NOT EXISTS "HrCandidateEvaluation_candidateId_createdAt_idx" ON "HrCandidateEvaluation" ("candidateId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "HrCandidateEvaluation_interviewId_idx" ON "HrCandidateEvaluation" ("interviewId");`,

  `CREATE INDEX IF NOT EXISTS "HrCandidateFollowUp_status_sendAt_idx" ON "HrCandidateFollowUp" ("status", "sendAt");`,
  `CREATE INDEX IF NOT EXISTS "HrCandidateFollowUp_candidateId_sendAt_idx" ON "HrCandidateFollowUp" ("candidateId", "sendAt");`,

  `CREATE INDEX IF NOT EXISTS "HrCandidateInvite_candidateId_createdAt_idx" ON "HrCandidateInvite" ("candidateId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "HrCandidateInvite_employeeInviteId_idx" ON "HrCandidateInvite" ("employeeInviteId");`,

  // FKs (idempotent).
  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateScreening_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateScreening"
      ADD CONSTRAINT "HrCandidateScreening_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInterview_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateInterview"
      ADD CONSTRAINT "HrCandidateInterview_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateEvaluation_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateEvaluation"
      ADD CONSTRAINT "HrCandidateEvaluation_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateEvaluation_interviewId_fkey') THEN
    ALTER TABLE "HrCandidateEvaluation"
      ADD CONSTRAINT "HrCandidateEvaluation_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES "HrCandidateInterview"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateFollowUp_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateFollowUp"
      ADD CONSTRAINT "HrCandidateFollowUp_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInvite_candidateId_fkey') THEN
    ALTER TABLE "HrCandidateInvite"
      ADD CONSTRAINT "HrCandidateInvite_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInvite_employeeInviteId_fkey') THEN
    ALTER TABLE "HrCandidateInvite"
      ADD CONSTRAINT "HrCandidateInvite_employeeInviteId_fkey"
      FOREIGN KEY ("employeeInviteId") REFERENCES "EmployeeInvite"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateScreening_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateScreening"
      ADD CONSTRAINT "HrCandidateScreening_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInterview_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateInterview"
      ADD CONSTRAINT "HrCandidateInterview_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateEvaluation_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateEvaluation"
      ADD CONSTRAINT "HrCandidateEvaluation_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateFollowUp_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateFollowUp"
      ADD CONSTRAINT "HrCandidateFollowUp_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrCandidateInvite_createdByUserId_fkey') THEN
    ALTER TABLE "HrCandidateInvite"
      ADD CONSTRAINT "HrCandidateInvite_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`,
];

async function verifyTables() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'HrCandidate',
         'HrCandidateScreening',
         'HrCandidateInterview',
         'HrCandidateEvaluation',
         'HrCandidateFollowUp',
         'HrCandidateInvite'
       )
     ORDER BY table_name;`,
  );

  const found = new Set((rows ?? []).map((r) => r.table_name));
  const required = [
    "HrCandidate",
    "HrCandidateScreening",
    "HrCandidateInterview",
    "HrCandidateEvaluation",
    "HrCandidateFollowUp",
    "HrCandidateInvite",
  ];

  const missing = required.filter((t) => !found.has(t));
  return { ok: missing.length === 0, missing };
}

async function main() {
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const label = sql.startsWith("SET ")
      ? sql
      : sql.startsWith("DO $$")
        ? "DO $$ block"
        : sql.split("\n")[0].slice(0, 90);

    try {
      await prisma.$executeRawUnsafe(sql);
      process.stdout.write(`ok ${i + 1}/${statements.length} - ${label}\n`);
    } catch (e) {
      process.stderr.write(`FAILED ${i + 1}/${statements.length} - ${label}\n`);
      throw e;
    }
  }

  const v = await verifyTables();
  if (!v.ok) throw new Error(`Patch ran but tables missing: ${v.missing.join(", ")}`);

  process.stdout.write("Verified HR tables exist.\n");
}

main()
  .catch((e) => {
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    console.error("Patch failed:", msg);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
