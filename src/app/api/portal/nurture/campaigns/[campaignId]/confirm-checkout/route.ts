import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";
import { isStripeConfigured, stripeGet } from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    sessionId: z.string().trim().min(1),
  })
  .strict();

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("nurtureCampaigns", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Stripe is not configured" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const { campaignId } = await ctx.params;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalNurtureSchema();

  const campaign = await prisma.portalNurtureCampaign.findFirst({
    where: { ownerId, id: campaignId },
    select: { id: true, installPaidAt: true },
  });
  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const sessionId = parsed.data.sessionId;

  const session = await stripeGet<any>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    "expand[]": ["subscription"],
  });

  const metaCampaignId = String(session?.metadata?.campaignId ?? "").trim();
  const metaOwnerId = String(session?.metadata?.ownerId ?? "").trim();
  if (!metaCampaignId || metaCampaignId !== campaignId || !metaOwnerId || metaOwnerId !== ownerId) {
    return NextResponse.json({ ok: false, error: "Mismatched checkout session" }, { status: 400 });
  }

  const paymentStatus = String(session?.payment_status ?? "");
  const status = String(session?.status ?? "");
  if (!(paymentStatus === "paid" || status === "complete")) {
    return NextResponse.json({ ok: false, error: "Checkout not complete" }, { status: 409 });
  }

  const subId =
    typeof session?.subscription === "string"
      ? session.subscription
      : typeof session?.subscription?.id === "string"
        ? session.subscription.id
        : "";

  const kind = String(session?.metadata?.kind ?? "");
  const includeInstall = kind === "nurture_install_and_monthly";

  const now = new Date();

  await prisma.portalNurtureCampaign.updateMany({
    where: { ownerId, id: campaignId },
    data: {
      stripeSubscriptionId: subId || undefined,
      installPaidAt: includeInstall ? (campaign.installPaidAt ?? now) : campaign.installPaidAt,
      updatedAt: now,
    },
  });

  return NextResponse.json({ ok: true, stripeSubscriptionId: subId || null, installPaidAtIso: includeInstall ? now.toISOString() : null });
}
