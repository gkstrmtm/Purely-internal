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
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('SalesReportingSettings', 'SalesReportingCredential')
     ORDER BY table_name;`,
  );
  const found = new Set((rows ?? []).map((r) => r.table_name));
  const ok = found.has("SalesReportingSettings") && found.has("SalesReportingCredential");
  return { ok, found: [...found] };
}

async function main() {
  const sql = loadSqlFile("prisma/manual/20260302_sales_reporting_integrations.sql");
  await prisma.$executeRawUnsafe(sql);

  const v = await verify();
  if (!v.ok) throw new Error(`Patch ran but tables missing. Found: ${v.found.join(", ") || "none"}`);

  process.stdout.write(`Verified tables exist: ${v.found.join(", ")}.\n`);
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
