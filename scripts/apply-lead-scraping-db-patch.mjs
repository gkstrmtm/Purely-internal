import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
  ],
});

prisma.$on("warn", (e) => {
  // Keep output short and non-sensitive.
  console.warn("[prisma warn]", e.message);
});

prisma.$on("error", (e) => {
  // Keep output short and non-sensitive.
  console.error("[prisma error]", e.message);
});

const statements = [
  // Fail fast on locks/hangs.
  "SET lock_timeout = '5s'",
  "SET statement_timeout = '30s'",

  // Types
  `DO $$
BEGIN
  CREATE TYPE "PortalLeadScrapeKind" AS ENUM ('B2B', 'B2C');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,
  `DO $$
BEGIN
  CREATE TYPE "PortalLeadSource" AS ENUM ('GOOGLE_PLACES');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;`,

  // Tables
  `CREATE TABLE IF NOT EXISTS "PortalLeadScrapeRun" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" "PortalLeadScrapeKind" NOT NULL,
  "requestedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "chargedCredits" INTEGER NOT NULL DEFAULT 0,
  "refundedCredits" INTEGER NOT NULL DEFAULT 0,
  "settingsJson" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalLeadScrapeRun_pkey" PRIMARY KEY ("id")
);`,
  `CREATE TABLE IF NOT EXISTS "PortalLead" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "source" "PortalLeadSource" NOT NULL DEFAULT 'GOOGLE_PLACES',
  "kind" "PortalLeadScrapeKind" NOT NULL DEFAULT 'B2B',
  "businessName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "address" TEXT,
  "niche" TEXT,
  "starred" BOOLEAN NOT NULL DEFAULT FALSE,
  "placeId" TEXT,
  "dataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalLead_pkey" PRIMARY KEY ("id")
);`,

  // Columns (idempotent, in case table already exists without them)
  `ALTER TABLE IF EXISTS "PortalLead" ADD COLUMN IF NOT EXISTS "email" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalLead" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT FALSE;`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS "PortalLeadScrapeRun_ownerId_createdAt_idx" ON "PortalLeadScrapeRun" ("ownerId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "PortalLeadScrapeRun_ownerId_kind_createdAt_idx" ON "PortalLeadScrapeRun" ("ownerId", "kind", "createdAt");`,

  `CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_createdAt_idx" ON "PortalLead" ("ownerId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_kind_createdAt_idx" ON "PortalLead" ("ownerId", "kind", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "PortalLead_ownerId_starred_createdAt_idx" ON "PortalLead" ("ownerId", "starred", "createdAt");`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "PortalLead_ownerId_placeId_key" ON "PortalLead" ("ownerId", "placeId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PortalLead_ownerId_phone_key" ON "PortalLead" ("ownerId", "phone");`,

  // FKs (idempotent)
  `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalLeadScrapeRun_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalLeadScrapeRun"
      ADD CONSTRAINT "PortalLeadScrapeRun_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,
  `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalLead_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalLead"
      ADD CONSTRAINT "PortalLead_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,
];

async function verifyColumns() {
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'PortalLead'
       AND column_name IN ('email', 'starred')
     ORDER BY column_name;`,
  );
  const found = new Set((cols ?? []).map((r) => r.column_name));
  const ok = found.has("email") && found.has("starred");
  return { ok, found: [...found] };
}

async function main() {
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const label = sql.startsWith("SET ")
      ? sql
      : sql.startsWith("DO $$")
        ? "DO $$ block"
        : sql.split("\n")[0].slice(0, 80);

    try {
      await prisma.$executeRawUnsafe(sql);
      process.stdout.write(`ok ${i + 1}/${statements.length} - ${label}\n`);
    } catch (e) {
      process.stderr.write(`FAILED ${i + 1}/${statements.length} - ${label}\n`);
      throw e;
    }
  }

  const v = await verifyColumns();
  if (!v.ok) {
    throw new Error(`Patch ran but columns missing. Found: ${v.found.join(", ") || "none"}`);
  }

  process.stdout.write(`Verified columns exist: ${v.found.join(", ")}\n`);
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
