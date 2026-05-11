import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { CREDIT_FUNNEL_EVENT_TYPES, parseCreditFunnelTrackingContext, trackCreditFunnelEvent } from "@/lib/funnelEventTracking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  pageId: z.string().trim().min(1).max(120),
  eventType: z.enum(CREDIT_FUNNEL_EVENT_TYPES),
  trackingContext: z.unknown().optional(),
  payload: z.unknown().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const page = await prisma.creditFunnelPage.findUnique({
    where: { id: parsed.data.pageId },
    select: { id: true, slug: true, funnelId: true, funnel: { select: { ownerId: true, slug: true } } },
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
    source: trackingContext?.source || "public_event",
    sessionId: trackingContext?.sessionId || null,
    referrer: trackingContext?.referrer || null,
    utmSource: trackingContext?.utmSource || null,
    utmMedium: trackingContext?.utmMedium || null,
    utmCampaign: trackingContext?.utmCampaign || null,
    utmContent: trackingContext?.utmContent || null,
    utmTerm: trackingContext?.utmTerm || null,
    payloadJson: parsed.data.payload ?? null,
  });

  return NextResponse.json({ ok: true });
}