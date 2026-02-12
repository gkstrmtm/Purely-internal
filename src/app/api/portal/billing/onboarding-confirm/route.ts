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
  sessionId: z.string().min(10),
});

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

  const allKnownServiceSlugs = ALL_KNOWN_SERVICE_SLUGS as unknown as string[];

  await prisma.$transaction(async (tx) => {
    for (const serviceSlug of allKnownServiceSlugs) {
      const existing = await tx.portalServiceSetup
        .findUnique({
          where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug } },
          select: { id: true, dataJson: true },
        })
        .catch(() => null);

      const state = toActivate.has(serviceSlug) ? "active" : "paused";
      const reason = toActivate.has(serviceSlug) ? undefined : "pending_payment";

      if (!existing) {
        await tx.portalServiceSetup.create({
          data: {
            ownerId: opts.ownerId,
            serviceSlug,
            status: "COMPLETE",
            dataJson: withLifecycle({}, { state, reason }) as any,
          },
          select: { id: true },
        });
        continue;
      }

      await tx.portalServiceSetup.update({
        where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug } },
        data: { dataJson: withLifecycle(existing.dataJson, { state, reason }) as any },
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

  if (!isStripeConfigured()) {
    const activation = await activateFromIntake({ ownerId, intakeJson: intakeRec });
    return NextResponse.json({ ok: true, stripeConfigured: false, activated: activation.activated });
  }

  const customerId = await getOrCreateStripeCustomerId(email);

  const session = await stripeGet<StripeCheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(parsed.data.sessionId)}`,
  );

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
