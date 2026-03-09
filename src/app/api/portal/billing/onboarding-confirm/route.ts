import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet } from "@/lib/stripeFetch";
import { ensureMonthlyCreditsGiftSchedule } from "@/lib/portalMonthlyCreditsGift";
import { PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } from "@/lib/portalBillingModel";
import {
  CORE_INCLUDED_SERVICE_SLUGS,
  monthlyTotalUsd,
  oneTimeTotalUsd,
  ONBOARDING_UPFRONT_PAID_PLAN_IDS,
  planById,
  planQuantity,
} from "@/lib/portalOnboardingWizardCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  sessionId: z.string().min(10).optional(),
  bypass: z.boolean().optional(),
});

function normalizeCouponCode(input: unknown): "RICHARD" | "BUILD" | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (code === "RICHARD" || code === "BUILD") return code;
  return null;
}

function readNumber(rec: unknown, key: string): number | null {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const v = (rec as any)[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBillingPreference(input: unknown): "credits" | "subscription" | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (v === "credits" || v === "credit" || v === "credits_only" || v === "credits-only") return "credits";
  if (v === "subscription" || v === "subs" || v === "stripe") return "subscription";
  return null;
}

function normalizePlanQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [kRaw, vRaw] of Object.entries(value as Record<string, unknown>)) {
    const k = String(kRaw).trim();
    if (!k) continue;
    const n = typeof vRaw === "number" ? vRaw : Number(vRaw);
    if (!Number.isFinite(n)) continue;
    out[k] = Math.max(0, Math.min(50, Math.trunc(n)));
  }
  return out;
}

function computeBonusCreditsFromIntake(intakeJson: Record<string, unknown>): number {
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
  const totalOneTime = oneTimeTotalUsd(billableForTotals, qtyById);
  const totalDueToday = totalMonthly + totalOneTime;
  if (!totalDueToday || totalDueToday <= 0) return 0;

  // Half of total paid today, converted at $0.10/credit => credits = usd * 10; half => usd * 5.
  return Math.max(0, Math.round(totalDueToday * 5));
}

async function grantOnboardingBonusCredits(opts: { ownerId: string; amount: number }): Promise<number> {
  const amount = Math.max(0, Math.trunc(opts.amount));
  if (!amount) return 0;

  const markerSlug = "onboarding-bonus-credits";

  return prisma.$transaction(async (tx) => {
    const existingMarker = await tx.portalServiceSetup
      .findUnique({
        where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: markerSlug } },
        select: { id: true },
      })
      .catch(() => null);
    if (existingMarker?.id) return 0;

    const creditsRow = await tx.portalServiceSetup
      .findUnique({
        where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: "credits" } },
        select: { id: true, dataJson: true },
      })
      .catch(() => null);

    const currentBalance = readNumber(creditsRow?.dataJson, "balance") ?? 0;
    const nextBalance = Math.max(0, Math.trunc(currentBalance) + amount);

    if (!creditsRow?.id) {
      await tx.portalServiceSetup.create({
        data: {
          ownerId: opts.ownerId,
          serviceSlug: "credits",
          status: "COMPLETE",
          dataJson: { balance: nextBalance, autoTopUp: true },
        },
        select: { id: true },
      });
    } else {
      await tx.portalServiceSetup.update({
        where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: "credits" } },
        data: {
          status: "COMPLETE",
          dataJson: {
            ...(creditsRow.dataJson && typeof creditsRow.dataJson === "object" && !Array.isArray(creditsRow.dataJson)
              ? (creditsRow.dataJson as any)
              : {}),
            balance: nextBalance,
          },
        },
        select: { id: true },
      });
    }

    await tx.portalServiceSetup.create({
      data: {
        ownerId: opts.ownerId,
        serviceSlug: markerSlug,
        status: "COMPLETE",
        dataJson: { amount, createdAt: new Date().toISOString() },
      },
      select: { id: true },
    });

    return amount;
  });
}

type StripeCheckoutSession = {
  id?: string;
  customer?: string | null;
  payment_status?: string | null;
  status?: string | null;
  mode?: string | null;
  subscription?: string | null;
};

function withLifecycle(dataJson: unknown, lifecycle: { state: string; reason?: string }) {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : {};
  return {
    ...rec,
    lifecycle: {
      ...(rec.lifecycle && typeof rec.lifecycle === "object" && !Array.isArray(rec.lifecycle) ? (rec.lifecycle as any) : {}),
      state: lifecycle.state,
      reason: lifecycle.reason,
      updatedAt: new Date().toISOString(),
    },
  };
}

function readObj(rec: unknown, key: string): Record<string, unknown> | null {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const v = (rec as any)[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as any;
}

function readString(rec: unknown, key: string): string | null {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const v = (rec as any)[key];
  return typeof v === "string" ? v : null;
}

function withoutPendingPaymentLifecycle(dataJson: unknown) {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : {};

  const lifecycle = readObj(rec, "lifecycle");
  const state = (readString(lifecycle, "state") || "").toLowerCase().trim();
  const reason = (readString(lifecycle, "reason") || "").toLowerCase().trim();
  if (state !== "paused" || reason !== "pending_payment") return rec;

  return withLifecycle(rec, { state: "inactive" });
}

const ALL_KNOWN_SERVICE_SLUGS = [
  "inbox",
  "media-library",
  "tasks",
  "reporting",
  "automations",
  "booking",
  "reviews",
  "blogs",
  "ai-receptionist",
  "ai-outbound-calls",
  "lead-scraping",
  "newsletter",
  "nurture-campaigns",
] as const;

function normalizeKnownServiceSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(ALL_KNOWN_SERVICE_SLUGS as unknown as string[]);
  const out: string[] = [];
  for (const raw of value) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) continue;
    if (!allowed.has(s)) continue;
    out.push(s);
  }
  return Array.from(new Set(out)).slice(0, 30);
}

async function activateFromIntake(opts: { ownerId: string; intakeJson: Record<string, unknown> }) {
  const selectedServiceSlugs = normalizeKnownServiceSlugs((opts.intakeJson as any).selectedServiceSlugs);

  const selectedPlanIdsRaw = (opts.intakeJson as any).selectedPlanIds;
  const selectedPlanIds = Array.isArray(selectedPlanIdsRaw)
    ? selectedPlanIdsRaw.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 20)
    : [];

  const toActivate = new Set<string>([...CORE_INCLUDED_SERVICE_SLUGS, ...selectedServiceSlugs]);
  for (const id of selectedPlanIds) {
    const plan = planById(id);
    if (!plan) continue;
    for (const slug of plan.serviceSlugsToActivate) toActivate.add(slug);
  }

  const couponCode = normalizeCouponCode((opts.intakeJson as any).couponCode);
  if (couponCode === "BUILD") {
    // BUILD: access to Inbox/Outbox + Media Library + Tasks (Core), plus AI Receptionist and Review Requests.
    toActivate.add("ai-receptionist");
    toActivate.add("reviews");
  }

  const allKnownServiceSlugs = ALL_KNOWN_SERVICE_SLUGS as unknown as string[];

  await prisma.$transaction(async (tx) => {
    // Activate purchased/included services.
    for (const serviceSlug of Array.from(toActivate)) {
      const existing = await tx.portalServiceSetup
        .findUnique({
          where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug } },
          select: { id: true, dataJson: true },
        })
        .catch(() => null);

      if (!existing) {
        await tx.portalServiceSetup.create({
          data: {
            ownerId: opts.ownerId,
            serviceSlug,
            status: "COMPLETE",
            dataJson: withLifecycle({}, { state: "active" }) as any,
          },
          select: { id: true },
        });
        continue;
      }

      await tx.portalServiceSetup.update({
        where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug } },
        data: { dataJson: withLifecycle(existing.dataJson, { state: "active" }) as any },
        select: { id: true },
      });
    }

    // Clear stale pending_payment flags for services not activated.
    const existingRows = await tx.portalServiceSetup.findMany({
      where: { ownerId: opts.ownerId, serviceSlug: { in: allKnownServiceSlugs } },
      select: { serviceSlug: true, dataJson: true },
    });

    for (const row of existingRows) {
      if (toActivate.has(row.serviceSlug)) continue;
      const nextJson = withoutPendingPaymentLifecycle(row.dataJson);
      if (nextJson === row.dataJson) continue;
      await tx.portalServiceSetup.update({
        where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: row.serviceSlug } },
        data: { dataJson: nextJson as any },
        select: { id: true },
      });
    }
  });

  return { activated: Array.from(toActivate) };
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const bypass = parsed.data.bypass === true;

  const ownerId = auth.session.user.id;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
  const email = String(owner?.email || auth.session.user.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing user email" }, { status: 400 });
  }

  const intake = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: "onboarding-intake" } },
      select: { dataJson: true },
    })
    .catch(() => null);

  const intakeRec = intake?.dataJson && typeof intake.dataJson === "object" && !Array.isArray(intake.dataJson)
    ? (intake.dataJson as Record<string, unknown>)
    : {};

  const billingPreference = normalizeBillingPreference((intakeRec as any).billingPreference);
  const starterCreditsGifted = readNumber(intakeRec, "starterCreditsGifted") ?? 0;
  let bonusCredits = 0;

  if (billingPreference) {
    await prisma.portalServiceSetup
      .upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } },
        create: {
          ownerId,
          serviceSlug: PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG,
          status: "COMPLETE",
          dataJson: { billingModel: billingPreference, source: "onboarding-confirm", updatedAt: new Date().toISOString() },
        },
        update: {
          status: "COMPLETE",
          dataJson: { billingModel: billingPreference, source: "onboarding-confirm", updatedAt: new Date().toISOString() },
        },
        select: { id: true },
      })
      .catch(() => null);
  }

  if (bypass || !isStripeConfigured()) {
    const activation = await activateFromIntake({ ownerId, intakeJson: intakeRec });
    if (billingPreference === "credits" && starterCreditsGifted > 0) {
      bonusCredits = Math.max(0, Math.trunc(starterCreditsGifted));
    }
    if (billingPreference === "subscription") {
      await ensureMonthlyCreditsGiftSchedule({ ownerId, intakeJson: intakeRec, anchorAtIso: new Date().toISOString() });
    }
    return NextResponse.json({ ok: true, stripeConfigured: isStripeConfigured(), bypass, activated: activation.activated, bonusCredits });
  }

  const customerId = await getOrCreateStripeCustomerId(email);

  const sessionId = parsed.data.sessionId;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing session_id" }, { status: 400 });
  }

  const session = await stripeGet<StripeCheckoutSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);

  if (!session || session.customer !== customerId) {
    return NextResponse.json({ ok: false, error: "Mismatched checkout session" }, { status: 400 });
  }

  if (String(session.mode || "") !== "subscription") {
    return NextResponse.json({ ok: false, error: "Invalid checkout mode" }, { status: 400 });
  }

  // Stripe uses both `status` and `payment_status`.
  const paid = String(session.payment_status || "").toLowerCase() === "paid" || String(session.status || "").toLowerCase() === "complete";
  if (!paid) {
    return NextResponse.json({ ok: false, error: "Checkout not complete" }, { status: 400 });
  }

  const activation = await activateFromIntake({ ownerId, intakeJson: intakeRec });

  if (billingPreference === "subscription") {
    const computed = computeBonusCreditsFromIntake(intakeRec);
    bonusCredits = await grantOnboardingBonusCredits({ ownerId, amount: computed });
    await ensureMonthlyCreditsGiftSchedule({ ownerId, intakeJson: intakeRec, anchorAtIso: new Date().toISOString() });
  }

  return NextResponse.json({ ok: true, stripeConfigured: true, activated: activation.activated, bonusCredits });
}
