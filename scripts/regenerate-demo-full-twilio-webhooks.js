/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

function loadEnvFileIfNeeded() {
  if (process.env.DATABASE_URL) return;

  const root = path.resolve(__dirname, "..");
  const candidates = [path.join(root, ".env.local"), path.join(root, ".env")];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && value && !process.env[key]) process.env[key] = value;
    }

    if (process.env.DATABASE_URL) return;
  }
}

function newToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

function withTokenInSettings(dataJson, tokenField) {
  const base = isPlainObject(dataJson) ? { ...dataJson } : {};
  const settings = isPlainObject(base.settings) ? { ...base.settings } : {};
  settings[tokenField] = newToken();
  base.settings = settings;
  if (!base.version) base.version = 1;
  return base;
}

async function main() {
  loadEnvFileIfNeeded();

  const prisma = new PrismaClient();

  const email = process.argv[2] || "demo-full@purelyautomation.com";
  console.log(`[regen] Looking up user: ${email}`);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const ownerId = user.id;

  const serviceSlugs = [
    { slug: "inbox", tokenField: "webhookToken" },
    { slug: "ai-receptionist", tokenField: "webhookToken" },
    { slug: "missed-call-textback", tokenField: "webhookToken" },
  ];

  const results = [];

  for (const s of serviceSlugs) {
    const existing = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: s.slug } },
      select: { dataJson: true, status: true },
    });

    const prevToken =
      existing && isPlainObject(existing.dataJson) && isPlainObject(existing.dataJson.settings)
        ? existing.dataJson.settings[s.tokenField]
        : null;

    const nextDataJson = withTokenInSettings(existing?.dataJson ?? null, s.tokenField);
    const nextToken = nextDataJson.settings[s.tokenField];

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: s.slug } },
      create: { ownerId, serviceSlug: s.slug, status: "COMPLETE", dataJson: nextDataJson },
      update: { status: "COMPLETE", dataJson: nextDataJson },
      select: { id: true },
    });

    results.push({ serviceSlug: s.slug, prevToken, nextToken });
  }

  console.log("[regen] Done. Updated tokens:");
  for (const r of results) {
    console.log(`  - ${r.serviceSlug}: ${String(r.prevToken || "(none)")} -> ${String(r.nextToken)}`);
  }

  await prisma.$disconnect();

  return { ok: true, ownerId, email, results };
}

main().catch((err) => {
  console.error("[regen] Failed:", err);
  process.exit(1);
});
