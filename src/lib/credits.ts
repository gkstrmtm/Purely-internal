import { prisma } from "@/lib/db";

export type CreditsState = {
  balance: number;
  autoTopUp: boolean;
};

const SERVICE_SLUG = "credits";

function normalizeInt(n: unknown, fallback: number) {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.floor(v);
}

function parseCreditsJson(value: unknown): CreditsState {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const balance = Math.max(0, normalizeInt(rec?.balance, 10));
  const autoTopUp = Boolean(rec?.autoTopUp);
  return { balance, autoTopUp };
}

export async function getCreditsState(ownerId: string): Promise<CreditsState> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  return parseCreditsJson(row?.dataJson);
}

export async function setAutoTopUp(ownerId: string, autoTopUp: boolean): Promise<CreditsState> {
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const prev = parseCreditsJson(existing?.dataJson);

  const next = { balance: prev.balance, autoTopUp: Boolean(autoTopUp) };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next },
    update: { dataJson: next },
    select: { dataJson: true },
  });

  return parseCreditsJson(row.dataJson);
}

export async function addCredits(ownerId: string, amount: number): Promise<CreditsState> {
  const delta = Math.max(0, Math.floor(amount));
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const prev = parseCreditsJson(existing?.dataJson);
  const next = { balance: prev.balance + delta, autoTopUp: prev.autoTopUp };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next },
    update: { dataJson: next },
    select: { dataJson: true },
  });

  return parseCreditsJson(row.dataJson);
}

export async function consumeCredits(
  ownerId: string,
  amount: number,
): Promise<{ ok: true; state: CreditsState } | { ok: false; state: CreditsState }> {
  const need = Math.max(0, Math.floor(amount));
  if (need === 0) return { ok: true, state: await getCreditsState(ownerId) };

  return await prisma.$transaction(async (tx) => {
    const row = await tx.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const prev = parseCreditsJson(row?.dataJson);
    if (prev.balance < need) {
      return { ok: false as const, state: prev };
    }

    const next = { balance: prev.balance - need, autoTopUp: prev.autoTopUp };

    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next },
      update: { dataJson: next },
      select: { id: true },
    });

    return { ok: true as const, state: next };
  });
}
