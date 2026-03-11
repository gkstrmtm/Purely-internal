import { prisma } from "@/lib/db";

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMailboxDomain() {
  const raw = safeOneLine(process.env.PORTAL_MAILBOX_DOMAIN || "");
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

  return cleaned || "purelyautomation.com";
}

let ensuredAt = 0;
const ENSURE_TTL_MS = 10 * 60 * 1000;

export async function ensurePortalMailboxSchema(): Promise<void> {
  const now = Date.now();
  if (ensuredAt && now - ensuredAt < ENSURE_TTL_MS) return;

  const domain = getMailboxDomain();

  const statements: string[] = [
    `
CREATE TABLE IF NOT EXISTS "PortalMailboxAddress" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "localPart" TEXT NOT NULL,
  "emailAddress" TEXT NOT NULL,
  "emailKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalMailboxAddress_pkey" PRIMARY KEY ("id")
);
    `.trim(),

    // Align with Prisma behavior (@updatedAt is written by Prisma).
    `ALTER TABLE "PortalMailboxAddress" ALTER COLUMN "updatedAt" DROP DEFAULT;`,

    // Allow a one-time user customization of their alias.
    `ALTER TABLE "PortalMailboxAddress" ADD COLUMN IF NOT EXISTS "customizeCount" INTEGER;`,
    `ALTER TABLE "PortalMailboxAddress" ADD COLUMN IF NOT EXISTS "customizedAt" TIMESTAMP(3);`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMailboxAddress_ownerId_key" ON "PortalMailboxAddress"("ownerId");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMailboxAddress_emailKey_key" ON "PortalMailboxAddress"("emailKey");`,
    `CREATE INDEX IF NOT EXISTS "PortalMailboxAddress_ownerId_idx" ON "PortalMailboxAddress"("ownerId");`,

    // Drift hardening: ensure no duplicate business emails/local-parts exist before adding unique indexes.
    // If duplicates exist (older deployments), deterministically re-alias non-canonical rows.
    `
WITH ranked AS (
  SELECT
    "id",
    "ownerId",
    "localPart",
    "emailAddress",
    "createdAt",
    row_number() OVER (PARTITION BY lower("emailAddress") ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "PortalMailboxAddress"
)
UPDATE "PortalMailboxAddress" p
SET
  "localPart" = left(
    p."localPart" || '-' || lower(substring(regexp_replace(p."ownerId", '[^a-zA-Z0-9]', '', 'g') from 1 for 6)),
    48
  ),
  "emailAddress" = left(
    p."localPart" || '-' || lower(substring(regexp_replace(p."ownerId", '[^a-zA-Z0-9]', '', 'g') from 1 for 6)),
    48
  ) || '@${domain}',
  "emailKey" = lower(
    left(
      p."localPart" || '-' || lower(substring(regexp_replace(p."ownerId", '[^a-zA-Z0-9]', '', 'g') from 1 for 6)),
      48
    ) || '@${domain}'
  ),
  "updatedAt" = current_timestamp
FROM ranked r
WHERE p."id" = r."id" AND r.rn > 1;
    `.trim(),

    `
WITH ranked AS (
  SELECT
    "id",
    "ownerId",
    "localPart",
    "createdAt",
    row_number() OVER (PARTITION BY lower("localPart") ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "PortalMailboxAddress"
)
UPDATE "PortalMailboxAddress" p
SET
  "localPart" = left(
    p."localPart" || '-' || lower(substring(regexp_replace(p."ownerId", '[^a-zA-Z0-9]', '', 'g') from 1 for 6)),
    48
  ),
  "emailAddress" = left(
    p."localPart" || '-' || lower(substring(regexp_replace(p."ownerId", '[^a-zA-Z0-9]', '', 'g') from 1 for 6)),
    48
  ) || '@${domain}',
  "emailKey" = lower(
    left(
      p."localPart" || '-' || lower(substring(regexp_replace(p."ownerId", '[^a-zA-Z0-9]', '', 'g') from 1 for 6)),
      48
    ) || '@${domain}'
  ),
  "updatedAt" = current_timestamp
FROM ranked r
WHERE p."id" = r."id" AND r.rn > 1;
    `.trim(),

    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMailboxAddress_emailAddress_key" ON "PortalMailboxAddress"(lower("emailAddress"));`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortalMailboxAddress_localPart_key" ON "PortalMailboxAddress"(lower("localPart"));`,
    `CREATE INDEX IF NOT EXISTS "PortalMailboxAddress_emailAddress_idx" ON "PortalMailboxAddress"(lower("emailAddress"));`,

    `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortalMailboxAddress_ownerId_fkey'
  ) THEN
    ALTER TABLE "PortalMailboxAddress"
      ADD CONSTRAINT "PortalMailboxAddress_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
    `.trim(),
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  ensuredAt = Date.now();
}
