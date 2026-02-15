import crypto from "crypto";

import { prisma } from "@/lib/db";
import { creditsPerTopUpPackage } from "@/lib/creditsTopup";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";

export type CreditsState = {
  balance: number;
  autoTopUp: boolean;
};

type CreditsSpendLedgerEntry = {
  id: string;
  amount: number;
  atIso?: string;
};

const SERVICE_SLUG = "credits";

const DEFAULT_FREE_CREDITS_EMAIL = "demo-full@purelyautomation.dev";

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function parseCsvEmails(raw: unknown): Set<string> {
  const s = typeof raw === "string" ? raw : "";
  const out = new Set<string>();
  for (const part of s.split(",")) {
    const e = normalizeEmail(part);
    if (e) out.add(e);
  }
  return out;
}

export async function isFreeCreditsOwner(ownerId: string): Promise<boolean> {
  const allow = new Set<string>();
  allow.add(DEFAULT_FREE_CREDITS_EMAIL);

  const demoFullFromEnv = normalizeEmail(process.env.DEMO_PORTAL_FULL_EMAIL);
  if (demoFullFromEnv) allow.add(demoFullFromEnv);

  const extra = parseCsvEmails(process.env.DEMO_FREE_CREDITS_EMAILS);
  for (const e of extra) allow.add(e);

  if (!allow.size) return false;

  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
  const email = normalizeEmail(user?.email);
  return Boolean(email && allow.has(email));
}

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

function parseSpendLedger(value: unknown): CreditsSpendLedgerEntry[] {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const raw = rec?.spendLedger;
  if (!Array.isArray(raw)) return [];
  const out: CreditsSpendLedgerEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.trim().slice(0, 160) : "";
    const amount = normalizeInt(e.amount, 0);
    if (!id) continue;
    if (amount < 0) continue;
    out.push({ id, amount, ...(typeof e.atIso === "string" && e.atIso.trim() ? { atIso: e.atIso.trim().slice(0, 40) } : {}) });
    if (out.length >= 500) break;
  }
  return out;
}

function advisoryLockKey(ownerId: string, idempotencyKey: string): bigint {
  const h = crypto.createHash("sha256").update(`${ownerId}:${idempotencyKey}`).digest();
  // Ensure it fits positive signed 64-bit.
  h[0] &= 0x7f;
  const hex = h.subarray(0, 8).toString("hex");
  return BigInt(`0x${hex}`);
}

export async function consumeCreditsOnce(
  ownerId: string,
  amount: number,
  idempotencyKey: string,
): Promise<
  | { ok: true; state: CreditsState; chargedAmount: number; alreadyConsumed: boolean }
  | { ok: false; state: CreditsState; chargedAmount: 0; alreadyConsumed: boolean }
> {
  const key = typeof idempotencyKey === "string" ? idempotencyKey.trim().slice(0, 160) : "";
  const need = Math.max(0, Math.floor(amount));
  if (!key) {
    const res = await consumeCredits(ownerId, need);
    return res.ok
      ? { ok: true, state: res.state, chargedAmount: need, alreadyConsumed: false }
      : { ok: false, state: res.state, chargedAmount: 0, alreadyConsumed: false };
  }
  if (need === 0) return { ok: true, state: await getCreditsState(ownerId), chargedAmount: 0, alreadyConsumed: false };

  // Demo accounts should never be blocked or charged.
  if (await isFreeCreditsOwner(ownerId).catch(() => false)) {
    return { ok: true, state: await getCreditsState(ownerId), chargedAmount: 0, alreadyConsumed: false };
  }

  // If auto top-up is enabled, try topping up once before failing.
  const maybeAutoTopUp = async (prev: CreditsState) => {
    if (!prev.autoTopUp) return { ok: false as const, state: prev };

    const priceId = (process.env.STRIPE_PRICE_CREDITS_TOPUP ?? "").trim();
    if (!isStripeConfigured() || !priceId) return { ok: false as const, state: prev };

    const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
    const email = normalizeEmail(user?.email);
    if (!email) return { ok: false as const, state: prev };

    const creditsPerPackage = creditsPerTopUpPackage();
    const shortfall = Math.max(0, need - prev.balance);
    const packages = Math.max(1, Math.min(20, Math.ceil(shortfall / creditsPerPackage)));

    try {
      const customerId = await getOrCreateStripeCustomerId(email);
      const customer = await stripeGet<any>(`/v1/customers/${customerId}`);

      const paymentMethod =
        typeof customer?.invoice_settings?.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : typeof customer?.default_source === "string"
            ? customer.default_source
            : "";
      if (!paymentMethod) return { ok: false as const, state: prev };

      const price = await stripeGet<any>(`/v1/prices/${priceId}`);
      const unitAmount = typeof price?.unit_amount === "number" ? price.unit_amount : NaN;
      const currency = typeof price?.currency === "string" ? price.currency : "usd";
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) return { ok: false as const, state: prev };

      const amountCents = Math.floor(unitAmount) * packages;
      if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false as const, state: prev };

      await stripePost<any>("/v1/payment_intents", {
        amount: amountCents,
        currency,
        customer: customerId,
        payment_method: paymentMethod,
        off_session: true,
        confirm: true,
        description: `Purely Automation credits auto top-up (${packages} package${packages === 1 ? "" : "s"})`,
        "metadata[kind]": "credits_auto_topup",
        "metadata[ownerId]": ownerId,
        "metadata[packages]": String(packages),
      });

      const credited = packages * creditsPerPackage;
      const state = await addCredits(ownerId, credited);
      return { ok: true as const, state };
    } catch {
      return { ok: false as const, state: prev };
    }
  };

  const currentRow = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const currentState = parseCreditsJson(currentRow?.dataJson);
  const currentLedger = parseSpendLedger(currentRow?.dataJson);
  const currentExisting = currentLedger.find((e) => e.id === key);
  if (currentExisting) {
    const alreadyAmount = Math.max(0, Math.floor(currentExisting.amount));
    return { ok: true as const, state: currentState, chargedAmount: alreadyAmount, alreadyConsumed: true };
  }
  if (currentState.balance < need) {
    const topped = await maybeAutoTopUp(currentState);
    if (!topped.ok) {
      return { ok: false as const, state: topped.state, chargedAmount: 0, alreadyConsumed: false };
    }
  }

  const lockId = advisoryLockKey(ownerId, key);
  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

    const row = await tx.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const prevState = parseCreditsJson(row?.dataJson);
    const prevLedger = parseSpendLedger(row?.dataJson);
    const existing = prevLedger.find((e) => e.id === key);
    if (existing) {
      const alreadyAmount = Math.max(0, Math.floor(existing.amount));
      return { ok: true as const, state: prevState, chargedAmount: alreadyAmount, alreadyConsumed: true };
    }

    if (prevState.balance < need) {
      return { ok: false as const, state: prevState, chargedAmount: 0 as const, alreadyConsumed: false };
    }

    const nextState: CreditsState = { balance: prevState.balance - need, autoTopUp: prevState.autoTopUp };
    const nextLedger: CreditsSpendLedgerEntry[] = [
      { id: key, amount: need, atIso: new Date().toISOString() },
      ...prevLedger,
    ].slice(0, 500);

    const payload = {
      ...(row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson) ? (row.dataJson as any) : {}),
      balance: nextState.balance,
      autoTopUp: nextState.autoTopUp,
      spendLedger: nextLedger,
    };

    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: payload },
      update: { dataJson: payload },
      select: { id: true },
    });

    return { ok: true as const, state: nextState, chargedAmount: need, alreadyConsumed: false };
  });
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

  // Demo accounts should never be blocked or charged.
  if (await isFreeCreditsOwner(ownerId).catch(() => false)) {
    return { ok: true, state: await getCreditsState(ownerId) };
  }

  const maybeAutoTopUp = async (prev: CreditsState) => {
    if (!prev.autoTopUp) return { ok: false as const, state: prev };

    const priceId = (process.env.STRIPE_PRICE_CREDITS_TOPUP ?? "").trim();
    if (!isStripeConfigured() || !priceId) return { ok: false as const, state: prev };

    const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
    const email = normalizeEmail(user?.email);
    if (!email) return { ok: false as const, state: prev };

    const creditsPerPackage = creditsPerTopUpPackage();
    const shortfall = Math.max(0, need - prev.balance);
    const packages = Math.max(1, Math.min(20, Math.ceil(shortfall / creditsPerPackage)));

    try {
      const customerId = await getOrCreateStripeCustomerId(email);
      const customer = await stripeGet<any>(`/v1/customers/${customerId}`);

      const paymentMethod =
        typeof customer?.invoice_settings?.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : typeof customer?.default_source === "string"
            ? customer.default_source
            : "";
      if (!paymentMethod) return { ok: false as const, state: prev };

      const price = await stripeGet<any>(`/v1/prices/${priceId}`);
      const unitAmount = typeof price?.unit_amount === "number" ? price.unit_amount : NaN;
      const currency = typeof price?.currency === "string" ? price.currency : "usd";
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) return { ok: false as const, state: prev };

      const amountCents = Math.floor(unitAmount) * packages;
      if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false as const, state: prev };

      await stripePost<any>("/v1/payment_intents", {
        amount: amountCents,
        currency,
        customer: customerId,
        payment_method: paymentMethod,
        off_session: true,
        confirm: true,
        description: `Purely Automation credits auto top-up (${packages} package${packages === 1 ? "" : "s"})`,
        "metadata[kind]": "credits_auto_topup",
        "metadata[ownerId]": ownerId,
        "metadata[packages]": String(packages),
      });

      const credited = packages * creditsPerPackage;
      const state = await addCredits(ownerId, credited);
      return { ok: true as const, state };
    } catch {
      return { ok: false as const, state: prev };
    }
  };

  // If auto top-up is enabled, try topping up once before failing.
  const current = await getCreditsState(ownerId);
  if (current.balance < need) {
    const topped = await maybeAutoTopUp(current);
    if (!topped.ok) return { ok: false as const, state: topped.state };
  }

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
