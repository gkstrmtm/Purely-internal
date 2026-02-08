import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";

const INTEGRATIONS_SLUG = "integrations";

function normalizeE164Maybe(raw: unknown): string | null {
  const parsed = normalizePhoneStrict(String(raw ?? ""));
  if (parsed.ok && parsed.e164) return parsed.e164;
  return null;
}

export async function findOwnerIdByTwilioToNumber(toRaw: string): Promise<string | null> {
  const toE164 = normalizeE164Maybe(toRaw);
  if (!toE164) return null;

  const rows = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: INTEGRATIONS_SLUG },
    select: { ownerId: true, dataJson: true },
    take: 5000,
  });

  for (const row of rows) {
    const rec = row.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;
    const twilio = rec && twilioIsObject(rec.twilio) ? (rec.twilio as Record<string, unknown>) : null;
    const fromE164 = twilio ? normalizeE164Maybe(twilio.fromNumberE164) : null;
    if (fromE164 && fromE164 === toE164) return row.ownerId;
  }

  return null;
}

function twilioIsObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}
