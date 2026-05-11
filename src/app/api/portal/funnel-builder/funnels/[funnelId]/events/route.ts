import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { parseCreditFunnelTrackingContext, trackCreditFunnelEvent } from "@/lib/funnelEventTracking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  pageId: z.string().trim().min(1).max(120),
  eventType: z.enum(["save_failed", "publish_failed"]),
  trackingContext: z.unknown().optional(),
  payload: z.unknown().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  if (!funnelId) return NextResponse.json({ ok: false, error: "Invalid funnelId" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const page = await prisma.creditFunnelPage.findFirst({
    where: {
      id: parsed.data.pageId,
      funnelId,
      funnel: { ownerId: auth.session.user.id },
    },
    select: { id: true, funnelId: true, funnel: { select: { ownerId: true } } },
  }).catch(() => null);

  if (!page?.funnel?.ownerId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const trackingContext = parseCreditFunnelTrackingContext(parsed.data.trackingContext);
  await trackCreditFunnelEvent({
    ownerId: page.funnel.ownerId,
    funnelId: page.funnelId,
    pageId: page.id,
    eventType: parsed.data.eventType,
    eventPath: trackingContext?.path || null,
    source: trackingContext?.source || "portal_builder",
    sessionId: trackingContext?.sessionId || null,
    referrer: trackingContext?.referrer || req.headers.get("referer") || null,
    utmSource: trackingContext?.utmSource || null,
    utmMedium: trackingContext?.utmMedium || null,
    utmCampaign: trackingContext?.utmCampaign || null,
    utmContent: trackingContext?.utmContent || null,
    utmTerm: trackingContext?.utmTerm || null,
    payloadJson: parsed.data.payload ?? null,
  });

  return NextResponse.json({ ok: true });
}