import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet } from "@/lib/stripeFetch";
import { CORE_INCLUDED_SERVICE_SLUGS, planById } from "@/lib/portalOnboardingWizardCatalog";

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

  if (bypass || !isStripeConfigured()) {
    const activation = await activateFromIntake({ ownerId, intakeJson: intakeRec });
    return NextResponse.json({ ok: true, stripeConfigured: isStripeConfigured(), bypass, activated: activation.activated });
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
  return NextResponse.json({ ok: true, stripeConfigured: true, activated: activation.activated });
}
