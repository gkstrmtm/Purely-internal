import { prisma } from "@/lib/db";
import { addCreditsTx } from "@/lib/credits";
import {
  monthlyTotalUsd,
  ONBOARDING_UPFRONT_PAID_PLAN_IDS,
  planById,
  planQuantity,
} from "@/lib/portalOnboardingWizardCatalog";

export const MONTHLY_CREDITS_GIFT_SETUP_SLUG = "__monthly_credits_gift";

type BillingCoupon = "RICHARD" | "BUILD";

type MonthlyCreditsGiftSchedule = {
  version: 1;
  enabled: boolean;
  source?: "onboarding" | "manager";

  amountCredits: number;

  anchorAtIso: string;
  nextGiftAtIso: string;
  lastGiftAtIso: string | null;

  giftsSent?: number;
};

function normalizeCouponCode(input: unknown): BillingCoupon | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (code === "RICHARD" || code === "BUILD") return code;
  return null;
}

function normalizePlanQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  let count = 0;
  for (const [kRaw, vRaw] of Object.entries(value as Record<string, unknown>)) {
    const k = String(kRaw).trim();
    if (!k) continue;

    const n = typeof vRaw === "number" ? vRaw : Number(vRaw);
    if (!Number.isFinite(n)) continue;

    out[k] = Math.max(0, Math.min(50, Math.trunc(n)));
    count += 1;
    if (count >= 30) break;
  }
  return out;
}

function parseSchedule(dataJson: unknown): MonthlyCreditsGiftSchedule | null {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) return null;
  const rec = dataJson as Record<string, unknown>;

  const version = typeof rec.version === "number" ? rec.version : 1;
  if (version !== 1) return null;

  const enabled = Boolean(rec.enabled);
  const amountCredits = typeof rec.amountCredits === "number" ? Math.trunc(rec.amountCredits) : Number(rec.amountCredits);
  const anchorAtIso = typeof rec.anchorAtIso === "string" ? rec.anchorAtIso.trim() : "";
  const nextGiftAtIso = typeof rec.nextGiftAtIso === "string" ? rec.nextGiftAtIso.trim() : "";
  const lastGiftAtIso = typeof rec.lastGiftAtIso === "string" ? rec.lastGiftAtIso.trim() : rec.lastGiftAtIso === null ? null : null;

  if (!anchorAtIso || !nextGiftAtIso) return null;
  if (!Number.isFinite(amountCredits)) return null;

  return {
    version: 1,
    enabled,
    amountCredits: Math.max(0, amountCredits),
    anchorAtIso,
    nextGiftAtIso,
    lastGiftAtIso,
    ...(typeof rec.source === "string" && (rec.source === "onboarding" || rec.source === "manager")
      ? { source: rec.source }
      : {}),
    ...(typeof rec.giftsSent === "number" && Number.isFinite(rec.giftsSent) ? { giftsSent: Math.max(0, Math.trunc(rec.giftsSent)) } : {}),
  };
}

function addMonthsPreserveDay(date: Date, monthsToAdd: number): Date {
  const months = Math.trunc(monthsToAdd);
  if (!Number.isFinite(months) || months === 0) return new Date(date);

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const ms = date.getMilliseconds();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(targetYear, targetMonth, clampedDay, hours, minutes, seconds, ms);
}

function computeMonthlyGiftCreditsFromIntake(intakeJson: Record<string, unknown>): number {
  const couponCode = normalizeCouponCode((intakeJson as any).couponCode);
  if (couponCode === "RICHARD") return 0;

  const allowed = new Set<string>(ONBOARDING_UPFRONT_PAID_PLAN_IDS as unknown as string[]);
  const rawPlanIds = Array.isArray((intakeJson as any).selectedPlanIds) ? ((intakeJson as any).selectedPlanIds as unknown[]) : [];
  const unique = Array.from(
    new Set(
      rawPlanIds
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .filter((id) => allowed.has(id)),
    ),
  );

  if (!unique.includes("core")) unique.unshift("core");

  if (unique.includes("lead-scraping-b2b") && unique.includes("lead-scraping-b2c")) {
    const filtered = unique.filter((id) => id !== "lead-scraping-b2b");
    unique.splice(0, unique.length, ...filtered);
  }

  const quantities = normalizePlanQuantities((intakeJson as any).selectedPlanQuantities);
  const qtyById: Record<string, number> = {};
  for (const planId of unique) {
    const plan = planById(planId);
    if (!plan) continue;
    qtyById[planId] = planQuantity(plan, quantities);
  }

  const billableForTotals = couponCode === "BUILD"
    ? unique.filter((id) => id !== "ai-receptionist" && id !== "reviews")
    : unique;

  const totalMonthly = monthlyTotalUsd(billableForTotals, qtyById);
  if (!totalMonthly || totalMonthly <= 0) return 0;

  return Math.max(0, Math.round(totalMonthly * 5));
}

export async function ensureMonthlyCreditsGiftSchedule(opts: {
  ownerId: string;
  intakeJson: Record<string, unknown>;
  anchorAtIso: string;
}): Promise<{ ok: true; amountCredits: number; nextGiftAtIso: string } | { ok: true; amountCredits: 0; nextGiftAtIso: null }> {
  const amountCredits = computeMonthlyGiftCreditsFromIntake(opts.intakeJson);
  if (!amountCredits) {
    return { ok: true, amountCredits: 0, nextGiftAtIso: null };
  }

  const anchor = new Date(opts.anchorAtIso);
  const next = addMonthsPreserveDay(anchor, 1).toISOString();

  const schedule: MonthlyCreditsGiftSchedule = {
    version: 1,
    enabled: true,
    source: "onboarding",
    amountCredits,
    anchorAtIso: anchor.toISOString(),
    nextGiftAtIso: next,
    lastGiftAtIso: null,
    giftsSent: 0,
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: MONTHLY_CREDITS_GIFT_SETUP_SLUG } },
    create: { ownerId: opts.ownerId, serviceSlug: MONTHLY_CREDITS_GIFT_SETUP_SLUG, status: "COMPLETE", dataJson: schedule as any },
    update: { status: "COMPLETE", dataJson: schedule as any },
    select: { id: true },
  });

  return { ok: true, amountCredits, nextGiftAtIso: next };
}

export async function processDueMonthlyCreditsGifts(opts: {
  limit?: number;
  maxCatchUpGiftsPerOwner?: number;
}): Promise<{ scanned: number; dueOwners: number; giftsSent: number; giftedOwners: number; errors: number }> {
  const limit = Math.max(1, Math.min(5000, Math.trunc(opts.limit ?? 400)));
  const maxCatchUp = Math.max(1, Math.min(6, Math.trunc(opts.maxCatchUpGiftsPerOwner ?? 2)));

  const now = new Date();

  let scanned = 0;
  let dueOwners = 0;
  let giftsSent = 0;
  let giftedOwners = 0;
  let errors = 0;

  let cursorId: string | null = null;
  const batchSize = Math.min(500, limit);

  while (scanned < limit) {
    const rows: Array<{ id: string; ownerId: string; dataJson: unknown }> = await prisma.portalServiceSetup.findMany({
      where: { serviceSlug: MONTHLY_CREDITS_GIFT_SETUP_SLUG, status: "COMPLETE" },
      select: { id: true, ownerId: true, dataJson: true },
      orderBy: { id: "asc" },
      take: Math.min(batchSize, limit - scanned),
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    if (!rows.length) break;
    cursorId = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned += 1;


      const schedule = parseSchedule(row.dataJson);
      if (!schedule?.enabled) continue;
      if (!schedule.amountCredits || schedule.amountCredits <= 0) continue;

      const nextAt = new Date(schedule.nextGiftAtIso);
      if (!Number.isFinite(nextAt.getTime())) continue;
      if (nextAt.getTime() > now.getTime()) continue;

      dueOwners += 1;

      try {
        const giftedCount = await prisma.$transaction(async (tx) => {
          const current = await tx.portalServiceSetup.findUnique({
            where: { ownerId_serviceSlug: { ownerId: row.ownerId, serviceSlug: MONTHLY_CREDITS_GIFT_SETUP_SLUG } },
            select: { dataJson: true },
          });

          const s = parseSchedule(current?.dataJson);
          if (!s?.enabled) return 0;

          const localNow = new Date();
          let localGifts = 0;
          let nextGiftAtIso = s.nextGiftAtIso;

          for (let i = 0; i < maxCatchUp; i += 1) {
            const dueAt = new Date(nextGiftAtIso);
            if (!Number.isFinite(dueAt.getTime())) break;
            if (dueAt.getTime() > localNow.getTime()) break;

            await addCreditsTx(tx as any, row.ownerId, s.amountCredits);

            localGifts += 1;
            nextGiftAtIso = addMonthsPreserveDay(dueAt, 1).toISOString();
          }

          if (localGifts > 0) {
            const updated: MonthlyCreditsGiftSchedule = {
              ...s,
              lastGiftAtIso: new Date().toISOString(),
              nextGiftAtIso,
              giftsSent: (s.giftsSent ?? 0) + localGifts,
            };

            await tx.portalServiceSetup.update({
              where: { ownerId_serviceSlug: { ownerId: row.ownerId, serviceSlug: MONTHLY_CREDITS_GIFT_SETUP_SLUG } },
              data: { status: "COMPLETE", dataJson: updated as any },
              select: { id: true },
            });
          }

          return localGifts;
        });

        if (giftedCount > 0) {
          giftsSent += giftedCount;
          giftedOwners += 1;
        }
      } catch {
        errors += 1;
      }
    }
  }

  return { scanned, dueOwners, giftsSent, giftedOwners, errors };
}
