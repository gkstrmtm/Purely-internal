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

loadEnv();

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

function loadSqlFile(relPath) {
  const p = path.join(process.cwd(), relPath);
  if (!fs.existsSync(p)) throw new Error(`Missing SQL file: ${relPath}`);
  return fs.readFileSync(p, "utf8");
}

async function verify() {
  const types = await prisma.$queryRawUnsafe(
    `SELECT t.typname
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname IN (
         'ClientBlogPostStatus',
         'PortalBlogGenerationSource',
         'ClientNewsletterKind',
         'ClientNewsletterStatus',
         'PortalNewsletterGenerationSource',
         'PortalNewsletterSendChannel'
       )
     ORDER BY t.typname;`,
  );
  const found = new Set((types ?? []).map((r) => r.typname));
  const ok =
    found.has("ClientBlogPostStatus") &&
    found.has("PortalBlogGenerationSource") &&
    found.has("ClientNewsletterKind") &&
    found.has("ClientNewsletterStatus") &&
    found.has("PortalNewsletterGenerationSource") &&
    found.has("PortalNewsletterSendChannel");
  return { ok, found: [...found] };
}

async function main() {
  const statements = [
    "SET lock_timeout = '5s'",
    "SET statement_timeout = '30s'",

    // Enum types
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ClientBlogPostStatus'
  ) THEN
    CREATE TYPE "ClientBlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');
  END IF;
END $$;`,
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalBlogGenerationSource'
  ) THEN
    CREATE TYPE "PortalBlogGenerationSource" AS ENUM ('CRON', 'GENERATE_NOW', 'DRAFT_GENERATE');
  END IF;
END $$;`,
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ClientNewsletterKind'
  ) THEN
    CREATE TYPE "ClientNewsletterKind" AS ENUM ('EXTERNAL', 'INTERNAL');
  END IF;
END $$;`,
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ClientNewsletterStatus'
  ) THEN
    CREATE TYPE "ClientNewsletterStatus" AS ENUM ('DRAFT', 'READY', 'SENT');
  END IF;
END $$;`,
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalNewsletterGenerationSource'
  ) THEN
    CREATE TYPE "PortalNewsletterGenerationSource" AS ENUM ('CRON', 'GENERATE_NOW');
  END IF;
END $$;`,
    `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'PortalNewsletterSendChannel'
  ) THEN
    CREATE TYPE "PortalNewsletterSendChannel" AS ENUM ('EMAIL', 'SMS');
  END IF;
END $$;`,

    // Column coercions
    `DO $$
DECLARE
  udt TEXT;
BEGIN
  SELECT c.udt_name INTO udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ClientBlogPost'
    AND c.column_name = 'status';

  IF udt IS NOT NULL AND udt <> 'ClientBlogPostStatus' THEN
    EXECUTE 'ALTER TABLE "ClientBlogPost" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE $cmd$
      ALTER TABLE "ClientBlogPost"
      ALTER COLUMN "status" TYPE "ClientBlogPostStatus"
      USING (
        CASE
          WHEN ("status"::text) = 'PUBLISHED' THEN 'PUBLISHED'
          ELSE 'DRAFT'
        END
      )::"ClientBlogPostStatus";
    $cmd$;
    EXECUTE 'ALTER TABLE "ClientBlogPost" ALTER COLUMN "status" SET DEFAULT ''DRAFT''::"ClientBlogPostStatus"';
  END IF;
END $$;`,
    `DO $$
DECLARE
  udt TEXT;
BEGIN
  SELECT c.udt_name INTO udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalBlogGenerationEvent'
    AND c.column_name = 'source';

  IF udt IS NOT NULL AND udt <> 'PortalBlogGenerationSource' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalBlogGenerationEvent"
      ALTER COLUMN "source" TYPE "PortalBlogGenerationSource"
      USING (
        CASE
          WHEN ("source"::text) = 'GENERATE_NOW' THEN 'GENERATE_NOW'
          WHEN ("source"::text) = 'DRAFT_GENERATE' THEN 'DRAFT_GENERATE'
          ELSE 'CRON'
        END
      )::"PortalBlogGenerationSource";
    $cmd$;
  END IF;
END $$;`,
    `DO $$
DECLARE
  udt_kind TEXT;
  udt_status TEXT;
BEGIN
  SELECT c.udt_name INTO udt_kind
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ClientNewsletter'
    AND c.column_name = 'kind';

  IF udt_kind IS NOT NULL AND udt_kind <> 'ClientNewsletterKind' THEN
    EXECUTE $cmd$
      ALTER TABLE "ClientNewsletter"
      ALTER COLUMN "kind" TYPE "ClientNewsletterKind"
      USING (
        CASE
          WHEN ("kind"::text) = 'INTERNAL' THEN 'INTERNAL'
          ELSE 'EXTERNAL'
        END
      )::"ClientNewsletterKind";
    $cmd$;
  END IF;

  SELECT c.udt_name INTO udt_status
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'ClientNewsletter'
    AND c.column_name = 'status';

  IF udt_status IS NOT NULL AND udt_status <> 'ClientNewsletterStatus' THEN
    EXECUTE 'ALTER TABLE "ClientNewsletter" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE $cmd$
      ALTER TABLE "ClientNewsletter"
      ALTER COLUMN "status" TYPE "ClientNewsletterStatus"
      USING (
        CASE
          WHEN ("status"::text) = 'SENT' THEN 'SENT'
          WHEN ("status"::text) = 'READY' THEN 'READY'
          ELSE 'DRAFT'
        END
      )::"ClientNewsletterStatus";
    $cmd$;
    EXECUTE 'ALTER TABLE "ClientNewsletter" ALTER COLUMN "status" SET DEFAULT ''DRAFT''::"ClientNewsletterStatus"';
  END IF;
END $$;`,
    `DO $$
DECLARE
  udt_src TEXT;
  udt_kind TEXT;
BEGIN
  SELECT c.udt_name INTO udt_src
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterGenerationEvent'
    AND c.column_name = 'source';

  IF udt_src IS NOT NULL AND udt_src <> 'PortalNewsletterGenerationSource' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterGenerationEvent"
      ALTER COLUMN "source" TYPE "PortalNewsletterGenerationSource"
      USING (
        CASE
          WHEN ("source"::text) = 'GENERATE_NOW' THEN 'GENERATE_NOW'
          ELSE 'CRON'
        END
      )::"PortalNewsletterGenerationSource";
    $cmd$;
  END IF;

  SELECT c.udt_name INTO udt_kind
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterGenerationEvent'
    AND c.column_name = 'kind';

  IF udt_kind IS NOT NULL AND udt_kind <> 'ClientNewsletterKind' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterGenerationEvent"
      ALTER COLUMN "kind" TYPE "ClientNewsletterKind"
      USING (
        CASE
          WHEN ("kind"::text) = 'INTERNAL' THEN 'INTERNAL'
          ELSE 'EXTERNAL'
        END
      )::"ClientNewsletterKind";
    $cmd$;
  END IF;
END $$;`,
    `DO $$
DECLARE
  udt_channel TEXT;
  udt_kind TEXT;
BEGIN
  SELECT c.udt_name INTO udt_channel
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterSendEvent'
    AND c.column_name = 'channel';

  IF udt_channel IS NOT NULL AND udt_channel <> 'PortalNewsletterSendChannel' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterSendEvent"
      ALTER COLUMN "channel" TYPE "PortalNewsletterSendChannel"
      USING (
        CASE
          WHEN ("channel"::text) = 'SMS' THEN 'SMS'
          ELSE 'EMAIL'
        END
      )::"PortalNewsletterSendChannel";
    $cmd$;
  END IF;

  SELECT c.udt_name INTO udt_kind
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'PortalNewsletterSendEvent'
    AND c.column_name = 'kind';

  IF udt_kind IS NOT NULL AND udt_kind <> 'ClientNewsletterKind' THEN
    EXECUTE $cmd$
      ALTER TABLE "PortalNewsletterSendEvent"
      ALTER COLUMN "kind" TYPE "ClientNewsletterKind"
      USING (
        CASE
          WHEN ("kind"::text) = 'INTERNAL' THEN 'INTERNAL'
          ELSE 'EXTERNAL'
        END
      )::"ClientNewsletterKind";
    $cmd$;
  END IF;
END $$;`,
  ];

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

  const v = await verify();
  if (!v.ok) throw new Error(`Patch ran but types missing. Found: ${v.found.join(", ") || "none"}`);

  process.stdout.write(`Verified enum types exist: ${v.found.join(", ")}.\n`);
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
