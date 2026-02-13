import { prisma } from "@/lib/db";
import { ensurePortalMailboxSchema } from "@/lib/portalMailboxSchema";
import crypto from "crypto";

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMailboxDomain() {
  const domain = safeOneLine(process.env.PORTAL_MAILBOX_DOMAIN || "") || "purelyautomation.com";
  return domain.toLowerCase();
}

function normalizeLocalPartBase(raw: string): string {
  const s = safeOneLine(raw).toLowerCase();
  const cleaned = s
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return cleaned || "business";
}

function isReservedLocalPart(localPart: string) {
  const reserved = new Set([
    "admin",
    "administrator",
    "billing",
    "contact",
    "help",
    "hello",
    "info",
    "inbox",
    "mail",
    "mailer-daemon",
    "noreply",
    "no-reply",
    "owner",
    "postmaster",
    "privacy",
    "sales",
    "security",
    "support",
    "team",
    "terms",
    "test",
    "webmaster",
  ]);
  return reserved.has(String(localPart || "").toLowerCase());
}

function normalizeDesiredLocalPart(raw: string): string {
  const base = safeOneLine(raw).toLowerCase();
  const cleaned = base
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return cleaned;
}

function makeEmailAddress(localPart: string) {
  const domain = getMailboxDomain();
  const lp = String(localPart || "").toLowerCase();
  return `${lp}@${domain}`;
}

export function extractAllEmailAddresses(raw: string): string[] {
  const text = safeOneLine(raw);
  if (!text) return [];

  const out: string[] = [];
  const re = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text))) {
    const email = String(m[1] || "").trim();
    if (email) out.push(email);
  }

  // Deduplicate while preserving order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const e of out) {
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(e);
  }

  return unique;
}

export async function findOwnerIdByMailboxEmailAddress(emailRaw: string): Promise<string | null> {
  const emailKey = safeOneLine(emailRaw).toLowerCase();
  if (!emailKey || !emailKey.includes("@")) return null;

  await ensurePortalMailboxSchema().catch(() => null);

  const rows = await prisma
    .$queryRaw<Array<{ ownerId: string }>>`
      select "ownerId"
      from "PortalMailboxAddress"
      where lower("emailKey") = lower(${emailKey})
      limit 1;
    `
    .catch(() => []);

  const ownerId = rows?.[0]?.ownerId ? String(rows[0].ownerId) : null;
  return ownerId || null;
}

export async function getOrCreateOwnerMailboxAddress(ownerIdRaw: string): Promise<{
  ownerId: string;
  localPart: string;
  emailAddress: string;
}> {
  const ownerId = safeOneLine(ownerIdRaw);
  if (!ownerId) throw new Error("Missing ownerId");

  await ensurePortalMailboxSchema().catch(() => null);

  const existingRows = await prisma
    .$queryRaw<Array<{ localPart: string; emailAddress: string; canChange: boolean }>>`
      select "localPart", "emailAddress", (coalesce("customizeCount", 0) = 0) as "canChange"
      from "PortalMailboxAddress"
      where "ownerId" = ${ownerId}
      limit 1;
    `
    .catch(() => []);

  if (existingRows?.[0]?.emailAddress && existingRows?.[0]?.localPart) {
    return { ownerId, localPart: String(existingRows[0].localPart), emailAddress: String(existingRows[0].emailAddress) };
  }

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId }, select: { businessName: true } })
    .catch(() => null);

  const baseFromName = safeOneLine(profile?.businessName || "") || "business";
  let base = normalizeLocalPartBase(baseFromName);
  if (isReservedLocalPart(base)) base = `${base}-biz`.slice(0, 48);

  const candidates: string[] = [base];
  const suffix = ownerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase();
  if (suffix) candidates.push(`${base}-${suffix}`.slice(0, 48));
  candidates.push(`${base}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 48));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = candidates[attempt] || `${base}-${attempt + 2}`.slice(0, 48);
    const emailAddress = makeEmailAddress(candidate);
    const emailKey = emailAddress.toLowerCase();

    try {
      const id = crypto.randomUUID();

      const inserted = await prisma.$queryRaw<Array<{ localPart: string; emailAddress: string }>>`
        insert into "PortalMailboxAddress" (
          "id", "ownerId", "localPart", "emailAddress", "emailKey", "customizeCount", "customizedAt", "createdAt", "updatedAt"
        ) values (
          ${id}, ${ownerId}, ${candidate}, ${emailAddress}, ${emailKey}, 0, null, current_timestamp, current_timestamp
        )
        on conflict do nothing
        returning "localPart", "emailAddress";
      `;

      if (inserted?.[0]?.localPart && inserted?.[0]?.emailAddress) {
        return {
          ownerId,
          localPart: String(inserted[0].localPart),
          emailAddress: String(inserted[0].emailAddress),
        };
      }
    } catch {
      // likely unique constraint; try next candidate
    }

    const rereadRows = await prisma
      .$queryRaw<Array<{ localPart: string; emailAddress: string }>>`
        select "localPart", "emailAddress"
        from "PortalMailboxAddress"
        where "ownerId" = ${ownerId}
        limit 1;
      `
      .catch(() => []);
    if (rereadRows?.[0]?.emailAddress && rereadRows?.[0]?.localPart) {
      return {
        ownerId,
        localPart: String(rereadRows[0].localPart),
        emailAddress: String(rereadRows[0].emailAddress),
      };
    }
  }

  // Last resort: re-read if it was created concurrently.
  const lastRows = await prisma
    .$queryRaw<Array<{ localPart: string; emailAddress: string }>>`
      select "localPart", "emailAddress"
      from "PortalMailboxAddress"
      where "ownerId" = ${ownerId}
      limit 1;
    `
    .catch(() => []);

  if (lastRows?.[0]?.emailAddress && lastRows?.[0]?.localPart) {
    return { ownerId, localPart: String(lastRows[0].localPart), emailAddress: String(lastRows[0].emailAddress) };
  }

  throw new Error("Unable to provision mailbox alias");
}

export async function getOwnerMailboxAddressForUi(ownerIdRaw: string): Promise<{
  ownerId: string;
  localPart: string;
  emailAddress: string;
  canChange: boolean;
}> {
  const ownerId = safeOneLine(ownerIdRaw);
  if (!ownerId) throw new Error("Missing ownerId");

  await ensurePortalMailboxSchema().catch(() => null);
  await getOrCreateOwnerMailboxAddress(ownerId);

  const rows = await prisma
    .$queryRaw<Array<{ localPart: string; emailAddress: string; canChange: boolean }>>`
      select "localPart", "emailAddress", (coalesce("customizeCount", 0) = 0) as "canChange"
      from "PortalMailboxAddress"
      where "ownerId" = ${ownerId}
      limit 1;
    `
    .catch(() => []);

  const row = rows?.[0];
  if (!row?.localPart || !row?.emailAddress) {
    const created = await getOrCreateOwnerMailboxAddress(ownerId);
    return { ownerId, localPart: created.localPart, emailAddress: created.emailAddress, canChange: true };
  }

  return {
    ownerId,
    localPart: String(row.localPart),
    emailAddress: String(row.emailAddress),
    canChange: Boolean(row.canChange),
  };
}

export async function updateOwnerMailboxLocalPartOnce(opts: {
  ownerId: string;
  desiredLocalPart: string;
}): Promise<{ ok: true; emailAddress: string; localPart: string } | { ok: false; error: string }> {
  const ownerId = safeOneLine(opts.ownerId);
  const desired = normalizeDesiredLocalPart(opts.desiredLocalPart);

  if (!ownerId) return { ok: false, error: "Unauthorized" };
  if (!desired || desired.length < 2) return { ok: false, error: "Email name must be at least 2 characters." };
  if (isReservedLocalPart(desired)) return { ok: false, error: "That email name is reserved. Please choose another." };

  await ensurePortalMailboxSchema().catch(() => null);
  await getOrCreateOwnerMailboxAddress(ownerId).catch(() => null);

  const nextEmailAddress = makeEmailAddress(desired);
  const nextEmailKey = nextEmailAddress.toLowerCase();

  try {
    const updated = await prisma.$queryRaw<Array<{ localPart: string; emailAddress: string }>>`
      update "PortalMailboxAddress"
      set
        "localPart" = ${desired},
        "emailAddress" = ${nextEmailAddress},
        "emailKey" = ${nextEmailKey},
        "customizeCount" = coalesce("customizeCount", 0) + 1,
        "customizedAt" = coalesce("customizedAt", current_timestamp),
        "updatedAt" = current_timestamp
      where
        "ownerId" = ${ownerId}
        and coalesce("customizeCount", 0) = 0
      returning "localPart", "emailAddress";
    `;

    if (updated?.[0]?.emailAddress && updated?.[0]?.localPart) {
      return { ok: true, emailAddress: String(updated[0].emailAddress), localPart: String(updated[0].localPart) };
    }

    return { ok: false, error: "You can only change your business email once." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || "");
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "That email is already taken. Please choose another." };
    }
    return { ok: false, error: "Unable to update email right now. Please try again." };
  }
}
