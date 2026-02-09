import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";

export function normalizeNameKey(nameRaw: string): string {
  const name = String(nameRaw ?? "").trim().toLowerCase();
  const cleaned = name
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "unknown").slice(0, 80);
}

export function normalizeEmailKey(emailRaw: string): string | null {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email) return null;
  if (!email.includes("@")) return null;
  return email.slice(0, 120);
}

export function normalizePhoneKey(phoneRaw: string): { phone: string | null; phoneKey: string | null; error?: string } {
  const raw = String(phoneRaw ?? "").trim();
  if (!raw) return { phone: null, phoneKey: null };
  const res = normalizePhoneStrict(raw);
  if (!res.ok) return { phone: null, phoneKey: null, error: res.error };
  if (!res.e164) return { phone: null, phoneKey: null };
  return { phone: res.e164, phoneKey: res.e164 };
}

type ContactCandidate = {
  id: string;
  nameKey: string;
  emailKey: string | null;
  phoneKey: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  updatedAt: Date;
};

function matchCount(
  c: ContactCandidate,
  keys: { nameKey: string; emailKey: string | null; phoneKey: string | null },
) {
  let matches = 0;
  if (keys.nameKey && c.nameKey === keys.nameKey) matches += 1;
  if (keys.emailKey && c.emailKey === keys.emailKey) matches += 1;
  if (keys.phoneKey && c.phoneKey === keys.phoneKey) matches += 1;
  return matches;
}

export async function findOrCreatePortalContact(input: {
  ownerId: string;
  name: string;
  email: string | null;
  phone: string | null;
}): Promise<string | null> {
  const ownerId = String(input.ownerId);
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) return null;

  const nameKey = normalizeNameKey(name);
  const emailKey = normalizeEmailKey(String(input.email ?? ""));
  const phoneNorm = normalizePhoneKey(String(input.phone ?? ""));
  if (phoneNorm.error) {
    // Let callers decide whether to treat this as an error.
    // We return null to avoid creating ambiguous contacts.
    return null;
  }

  const phoneKey = phoneNorm.phoneKey;
  const phone = phoneNorm.phone;
  const email = emailKey ? String(input.email ?? "").trim().slice(0, 120) : null;

  const ors: any[] = [{ nameKey }];
  if (emailKey) ors.push({ emailKey });
  if (phoneKey) ors.push({ phoneKey });

  try {
    await ensurePortalContactsSchema();

    const candidates = (await (prisma as any).portalContact.findMany({
      where: { ownerId, OR: ors },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        nameKey: true,
        emailKey: true,
        phoneKey: true,
        name: true,
        email: true,
        phone: true,
        updatedAt: true,
      },
    })) as ContactCandidate[];

    let best: { c: ContactCandidate; score: number } | null = null;
    for (const c of candidates) {
      const score = matchCount(c, { nameKey, emailKey, phoneKey });
      if (!best || score > best.score) best = { c, score };
    }

    if (best && best.score >= 2) {
      const existing = best.c;
      const data: any = {
        name,
        nameKey,
      };

      if (!existing.emailKey && emailKey) {
        data.email = email;
        data.emailKey = emailKey;
      }

      if (!existing.phoneKey && phoneKey) {
        data.phone = phone;
        data.phoneKey = phoneKey;
      }

      await (prisma as any).portalContact.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      });

      return String(existing.id);
    }

    const created = await (prisma as any).portalContact.create({
      data: {
        ownerId,
        name,
        nameKey,
        email: emailKey ? email : null,
        emailKey: emailKey ? emailKey : null,
        phone: phoneKey ? phone : null,
        phoneKey: phoneKey ? phoneKey : null,
      },
      select: { id: true },
    });

    return String(created.id);
  } catch {
    // Drift-hardening: if PortalContact table isn't deployed yet, do not break user flows.
    return null;
  }
}
