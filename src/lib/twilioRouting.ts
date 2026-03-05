import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";

const INTEGRATIONS_SLUG = "integrations";

function normalizeE164Maybe(raw: unknown): string | null {
  const parsed = normalizePhoneStrict(String(raw ?? ""));
  if (parsed.ok && parsed.e164) return parsed.e164;
  return null;
}

async function findOwnerByIntegrationsJsonPathEquals(opts: {
  path: string[];
  equals: string;
}): Promise<string | null> {
  try {
    const row = await prisma.portalServiceSetup.findFirst({
      where: {
        serviceSlug: INTEGRATIONS_SLUG,
        // Prisma JSON path filters are supported on Postgres; keep as any for portability.
        dataJson: { path: opts.path, equals: opts.equals } as any,
      },
      select: { ownerId: true },
    });
    return row?.ownerId ?? null;
  } catch {
    return null;
  }
}

export async function findOwnerIdByTwilioAccountSid(accountSidRaw: string): Promise<string | null> {
  const accountSid = String(accountSidRaw || "").trim();
  if (!accountSid) return null;
  return await findOwnerByIntegrationsJsonPathEquals({ path: ["twilio", "accountSid"], equals: accountSid });
}

export async function findOwnerIdByTwilioToNumber(toRaw: string): Promise<string | null> {
  const toE164 = normalizeE164Maybe(toRaw);
  if (!toE164) return null;

  // Fast path: JSON-path lookup (avoids scanning many rows).
  const fast = await findOwnerByIntegrationsJsonPathEquals({ path: ["twilio", "fromNumberE164"], equals: toE164 });
  if (fast) return fast;

  // Fallback: paginate through all rows (no hard cap).
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const rows: Array<{ id: string; ownerId: string; dataJson: unknown }> = (await prisma.portalServiceSetup.findMany({
      where: { serviceSlug: INTEGRATIONS_SLUG },
      select: { id: true, ownerId: true, dataJson: true },
      orderBy: { id: "asc" },
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })) as any;

    if (!rows.length) break;

    for (const row of rows) {
      const rec = row.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
        ? (row.dataJson as Record<string, unknown>)
        : null;
      const twilio = rec && twilioIsObject(rec.twilio) ? (rec.twilio as Record<string, unknown>) : null;
      const fromE164 = twilio ? normalizeE164Maybe(twilio.fromNumberE164) : null;
      if (fromE164 && fromE164 === toE164) return row.ownerId;
    }

    cursor = rows[rows.length - 1]?.id ?? null;
  }

  return null;
}

function twilioIsObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}
