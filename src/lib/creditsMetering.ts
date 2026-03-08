import crypto from "crypto";

import { prisma } from "@/lib/db";
import { ensureCreditsBalance, getCreditsState, isCreditsCanceledForOwner, type CreditsState } from "@/lib/credits";

type MeterState = {
  total: number;
  chargedUnits: number;
  updatedAtIso?: string;
};

type CreditsDataJson = {
  balance?: unknown;
  autoTopUp?: unknown;
  spendLedger?: unknown;
  lifecycle?: unknown;
  meters?: unknown;
};

const SERVICE_SLUG = "credits";

function normalizeInt(n: unknown, fallback: number) {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.floor(v);
}

function parseMeters(value: unknown): Record<string, MeterState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const rec = value as Record<string, unknown>;
  const out: Record<string, MeterState> = {};

  for (const [k, v] of Object.entries(rec)) {
    const key = typeof k === "string" ? k.trim().slice(0, 80) : "";
    if (!key) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const r = v as Record<string, unknown>;
    const total = Math.max(0, normalizeInt(r.total, 0));
    const chargedUnits = Math.max(0, normalizeInt(r.chargedUnits, 0));
    const updatedAtIso = typeof r.updatedAtIso === "string" ? r.updatedAtIso.trim().slice(0, 40) : undefined;
    out[key] = { total, chargedUnits, ...(updatedAtIso ? { updatedAtIso } : {}) };
  }

  return out;
}

function advisoryLockKey(scope: string): bigint {
  const h = crypto.createHash("sha256").update(scope).digest();
  h[0] &= 0x7f;
  const hex = h.subarray(0, 8).toString("hex");
  return BigInt(`0x${hex}`);
}

export type ThresholdMeterSpec = {
  meterKey: string;
  unitSize: number; // e.g. 100 messages
  creditsPerUnit: number; // e.g. 1 credit
};

export async function recordThresholdMeterUsage(opts: {
  ownerId: string;
  spec: ThresholdMeterSpec;
  increment: number;
  allowOverdraft?: boolean;
  note?: string;
}): Promise<
  | {
      ok: true;
      state: CreditsState;
      meter: { total: number; chargedUnits: number };
      chargedCredits: number;
      chargedUnitsDelta: number;
      overdraft: boolean;
    }
  | { ok: false; state: CreditsState; error: string }
> {
  const ownerId = String(opts.ownerId || "").trim();
  if (!ownerId) return { ok: false, state: await getCreditsState(ownerId), error: "Missing ownerId" };

  const meterKey = String(opts.spec?.meterKey || "").trim().slice(0, 80);
  const unitSize = Math.max(1, Math.floor(opts.spec?.unitSize || 0));
  const creditsPerUnit = Math.max(0, Math.floor(opts.spec?.creditsPerUnit || 0));
  const increment = Math.max(0, Math.floor(opts.increment || 0));

  if (!meterKey) return { ok: false, state: await getCreditsState(ownerId), error: "Missing meterKey" };
  if (increment === 0) {
    const state = await getCreditsState(ownerId);
    return {
      ok: true,
      state,
      meter: { total: 0, chargedUnits: 0 },
      chargedCredits: 0,
      chargedUnitsDelta: 0,
      overdraft: false,
    };
  }

  if (await isCreditsCanceledForOwner(ownerId).catch(() => false)) {
    return { ok: false, state: await getCreditsState(ownerId), error: "Credits billing is canceled" };
  }

  const lockId = advisoryLockKey(`credits_meter:${ownerId}:${meterKey}`);
  const nowIso = new Date().toISOString();

  // First pass: read meter state to estimate required credits.
  const preRow = await prisma.portalServiceSetup
    .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } }, select: { dataJson: true } })
    .catch(() => null);

  const preJson = (preRow?.dataJson && typeof preRow.dataJson === "object" && !Array.isArray(preRow.dataJson)
    ? (preRow.dataJson as CreditsDataJson)
    : {}) as CreditsDataJson;
  const metersPre = parseMeters(preJson.meters);
  const prevMeter = metersPre[meterKey] ?? { total: 0, chargedUnits: 0 };

  const nextTotal = prevMeter.total + increment;
  const nextChargedUnitsTarget = Math.floor(nextTotal / unitSize);
  const chargedUnitsDelta = Math.max(0, nextChargedUnitsTarget - prevMeter.chargedUnits);
  const needCredits = chargedUnitsDelta * creditsPerUnit;

  if (needCredits > 0) {
    // Best-effort auto top-up before the locked transaction.
    await ensureCreditsBalance(ownerId, needCredits).catch(() => null);
  }

  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

    const row = await tx.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true, status: true },
    });

    const json = (row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as CreditsDataJson)
      : {}) as CreditsDataJson;

    const state: CreditsState = {
      balance: Math.max(0, normalizeInt(json.balance, 10)),
      autoTopUp: Boolean(json.autoTopUp),
    };

    // If someone cancels after our pre-check, fail closed.
    const lifecycle =
      json.lifecycle && typeof json.lifecycle === "object" && !Array.isArray(json.lifecycle)
        ? (json.lifecycle as Record<string, unknown>)
        : null;
    const lifecycleState = typeof lifecycle?.state === "string" ? lifecycle.state.toLowerCase().trim() : "";
    if (lifecycleState === "canceled") {
      return { ok: false as const, state, error: "Credits billing is canceled" };
    }

    const meters = parseMeters(json.meters);
    const prev = meters[meterKey] ?? { total: 0, chargedUnits: 0 };

    const total = prev.total + increment;
    const chargedUnitsTarget = Math.floor(total / unitSize);
    const unitsDelta = Math.max(0, chargedUnitsTarget - prev.chargedUnits);
    const required = unitsDelta * creditsPerUnit;

    const allowOverdraft = opts.allowOverdraft === true;

    if (required > 0 && state.balance < required && !allowOverdraft) {
      // Do not advance the meter when we're failing closed.
      return { ok: false as const, state, error: "Insufficient credits" };
    }

    const overdraft = required > 0 && state.balance < required;
    const nextBalance = overdraft ? 0 : Math.max(0, state.balance - required);

    const nextMeters = {
      ...meters,
      [meterKey]: {
        total,
        chargedUnits: prev.chargedUnits + (overdraft ? 0 : unitsDelta),
        updatedAtIso: nowIso,
      } satisfies MeterState,
    };

    const payload: any = {
      ...(row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson) ? (row.dataJson as any) : {}),
      balance: nextBalance,
      autoTopUp: state.autoTopUp,
      meters: nextMeters,
    };

    // Lightweight spend marker (best-effort audit).
    if (required > 0 && !overdraft) {
      const prevLedger = Array.isArray((payload as any).spendLedger) ? ((payload as any).spendLedger as any[]) : [];
      const entryId = `meter:${meterKey}:${nowIso}:${chargedUnitsTarget}`.slice(0, 160);
      const nextLedger = [{ id: entryId, amount: required, atIso: nowIso }, ...prevLedger].slice(0, 500);
      (payload as any).spendLedger = nextLedger;
      if (opts.note) (payload as any).lastMeterNote = String(opts.note).slice(0, 220);
    }

    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: row?.status ?? "COMPLETE", dataJson: payload },
      update: { dataJson: payload },
      select: { id: true },
    });

    const nextState: CreditsState = { balance: nextBalance, autoTopUp: state.autoTopUp };

    return {
      ok: true as const,
      state: nextState,
      meter: { total, chargedUnits: (nextMeters as any)[meterKey].chargedUnits },
      chargedCredits: overdraft ? 0 : required,
      chargedUnitsDelta: overdraft ? 0 : unitsDelta,
      overdraft,
    };
  });
}
