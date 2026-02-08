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

  // Tables
  `CREATE TABLE IF NOT EXISTS "PortalMediaFolder" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalMediaFolder_pkey" PRIMARY KEY ("id")
);`,

  `CREATE TABLE IF NOT EXISTS "PortalMediaItem" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "folderId" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "tag" TEXT NOT NULL,
  "publicToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalMediaItem_pkey" PRIMARY KEY ("id")
);`,

  // Columns (idempotent, in case a table exists but is missing fields)
  `ALTER TABLE IF EXISTS "PortalMediaFolder" ADD COLUMN IF NOT EXISTS "parentId" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaFolder" ADD COLUMN IF NOT EXISTS "name" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaFolder" ADD COLUMN IF NOT EXISTS "nameKey" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaFolder" ADD COLUMN IF NOT EXISTS "tag" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaFolder" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaFolder" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE IF EXISTS "PortalMediaFolder" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "folderId" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "fileName" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;`,
  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "bytes" BYTEA;`,
  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "tag" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;`,
  `ALTER TABLE IF EXISTS "PortalMediaItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  // Indexes
  `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMediaFolder_ownerId_tag_key" ON "PortalMediaFolder" ("ownerId", "tag");`,
  `CREATE INDEX IF NOT EXISTS "PortalMediaFolder_ownerId_parentId_nameKey_idx" ON "PortalMediaFolder" ("ownerId", "parentId", "nameKey");`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMediaItem_ownerId_tag_key" ON "PortalMediaItem" ("ownerId", "tag");`,
  `CREATE INDEX IF NOT EXISTS "PortalMediaItem_ownerId_folderId_createdAt_idx" ON "PortalMediaItem" ("ownerId", "folderId", "createdAt");`,

  // FKs (idempotent)
  `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaFolder_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalMediaFolder"
      ADD CONSTRAINT "PortalMediaFolder_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaFolder_parentId_fkey'
  ) THEN
    ALTER TABLE "PortalMediaFolder"
      ADD CONSTRAINT "PortalMediaFolder_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "PortalMediaFolder"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaItem_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalMediaItem"
      ADD CONSTRAINT "PortalMediaItem_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;`,

  `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMediaItem_folderId_fkey'
  ) THEN
    ALTER TABLE "PortalMediaItem"
      ADD CONSTRAINT "PortalMediaItem_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "PortalMediaFolder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;`,
];

async function verifyTables() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('PortalMediaFolder', 'PortalMediaItem')
     ORDER BY table_name;`,
  );
  const found = new Set((rows ?? []).map((r) => r.table_name));
  return found.has("PortalMediaFolder") && found.has("PortalMediaItem");
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

  const ok = await verifyTables();
  if (!ok) throw new Error("Patch ran but tables not found (PortalMediaFolder, PortalMediaItem)");

  process.stdout.write("Verified tables exist: PortalMediaFolder, PortalMediaItem\n");
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
