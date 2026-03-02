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
    console.error("  ALLOW_PROD_DB_MUTATIONS=1 node scripts/apply-stripe-db-patch.mjs\n");
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
  "SET lock_timeout = '5s'",
  "SET statement_timeout = '30s'",

  `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyCiphertext" TEXT;`,
  `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyIv" TEXT;`,
  `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyAuthTag" TEXT;`,
  `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeSecretKeyPrefix" TEXT;`,
  `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT;`,
  `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "stripeConnectedAt" TIMESTAMP(3);`,
];

async function verifyColumns() {
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'User'
       AND column_name IN (
         'stripeSecretKeyCiphertext',
         'stripeSecretKeyIv',
         'stripeSecretKeyAuthTag',
         'stripeSecretKeyPrefix',
         'stripeAccountId',
         'stripeConnectedAt'
       )
     ORDER BY column_name;`,
  );
  const found = new Set((cols ?? []).map((r) => r.column_name));
  const needed = [
    "stripeSecretKeyCiphertext",
    "stripeSecretKeyIv",
    "stripeSecretKeyAuthTag",
    "stripeSecretKeyPrefix",
    "stripeAccountId",
    "stripeConnectedAt",
  ];
  const ok = needed.every((c) => found.has(c));
  return { ok, found: [...found] };
}

async function main() {
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const label = sql.startsWith("SET ") ? sql : sql.split("\n")[0].slice(0, 80);

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

  process.stdout.write(`Verified Stripe columns exist on User: ${v.found.join(", ")}\n`);
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
