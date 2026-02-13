import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { addCredits } from "@/lib/credits";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet } from "@/lib/stripeFetch";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    sessionId: z.string().trim().min(1),
  })
  .strict();

function normalizeInt(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function readArray(value: unknown, key: string): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const v = (value as any)[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured" }, { status: 400 });
  }

  const email = auth.session.user.email;
  if (!email) return NextResponse.json({ ok: false, error: "Missing user email" }, { status: 400 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const sessionId = parsed.data.sessionId;

  const customer = await getOrCreateStripeCustomerId(String(email));

  const session = await stripeGet<any>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);

  const metaKind = String(session?.metadata?.kind ?? "").trim();
  const metaOwnerId = String(session?.metadata?.ownerId ?? "").trim();
  if (metaKind !== "credits_topup" || !metaOwnerId || metaOwnerId !== ownerId) {
    return NextResponse.json({ ok: false, error: "Mismatched checkout session" }, { status: 400 });
  }

  const sessionCustomer = typeof session?.customer === "string" ? session.customer : "";
  if (!sessionCustomer || sessionCustomer !== customer) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const paymentStatus = String(session?.payment_status ?? "");
  const status = String(session?.status ?? "");
  if (!(paymentStatus === "paid" || status === "complete")) {
    return NextResponse.json({ ok: false, error: "Checkout not complete" }, { status: 409 });
  }

  const credits = normalizeInt(session?.metadata?.credits);
  if (!credits) return NextResponse.json({ ok: false, error: "Missing credits metadata" }, { status: 400 });

  const now = new Date();

  // Idempotency: store applied session ids in a lightweight PortalServiceSetup row.
  const ledgerSlug = "credits-topup-ledger";

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: ledgerSlug } },
      select: { dataJson: true },
    });

    const applied = new Set(readArray(existing?.dataJson, "appliedSessionIds"));
    if (applied.has(sessionId)) {
      return { alreadyApplied: true as const };
    }

    applied.add(sessionId);

    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: ledgerSlug } },
      create: {
        ownerId,
        serviceSlug: ledgerSlug,
        status: "COMPLETE",
        dataJson: { appliedSessionIds: Array.from(applied).slice(-200), updatedAtIso: now.toISOString() },
      },
      update: {
        dataJson: { appliedSessionIds: Array.from(applied).slice(-200), updatedAtIso: now.toISOString() },
      },
      select: { id: true },
    });

    await addCredits(ownerId, credits);

    return { alreadyApplied: false as const };
  });

  if (!result.alreadyApplied) {
    const baseUrl = getAppBaseUrl();
    void tryNotifyPortalAccountUsers({
      ownerId,
      kind: "credits_purchased",
      subject: `Credits added: ${credits}`,
      text: [`Credits were added to your account.`, "", `Credits: ${credits}`, "", `Open billing: ${baseUrl}/portal/app/billing`].join("\n"),
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, applied: !result.alreadyApplied, creditsAdded: credits });
}
