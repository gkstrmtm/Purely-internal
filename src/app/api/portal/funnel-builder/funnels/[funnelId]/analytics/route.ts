import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  createEmptyCreditFunnelEventMetrics,
  getCreditFunnelWindowAnalytics,
} from "@/lib/funnelEventTracking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeWindowDays(raw: string | null) {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(7, Math.min(90, parsed));
}

function toPct(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function describePageDropOff(input: ReturnType<typeof createEmptyCreditFunnelEventMetrics>) {
  const leadActions = input.form_submitted + input.booking_created + Math.max(input.checkout_started, input.checkout_completed);
  if (input.page_view > 0 && input.cta_click === 0) return "Traffic is landing here without any CTA engagement yet.";
  if (input.form_started > input.form_submitted) return "Visitors are starting the form here, but some are dropping before submission.";
  if (input.validation_failed > 0) return "Validation failures are blocking completion on this page.";
  if (input.checkout_failed > 0) return "Checkout attempts are failing on this page.";
  if (input.cta_click > 0 && leadActions === 0) return "Visitors click here, but nobody is reaching form, booking, or checkout.";
  if (input.add_to_cart > 0 && input.checkout_started === 0) return "Cart intent is showing up here, but it is not turning into checkout starts.";
  return null;
}

function buildHighlights(input: {
  trackingReady: boolean;
  totals: ReturnType<typeof createEmptyCreditFunnelEventMetrics>;
  pages: Array<{
    title: string;
    slug: string;
    metrics: ReturnType<typeof createEmptyCreditFunnelEventMetrics>;
    biggestDropOff: string | null;
  }>;
}) {
  if (!input.trackingReady) {
    return ["The internal event store is unavailable, so live funnel analytics cannot be computed right now."];
  }

  if (input.totals.page_view === 0) {
    return ["No tracked funnel traffic has landed in this window yet."];
  }

  const highlights: string[] = [];
  if (input.totals.cta_click === 0) {
    highlights.push("Traffic is reaching the funnel, but no CTA clicks have been captured in this window.");
  }

  if (input.totals.form_started > input.totals.form_submitted) {
    highlights.push("Some visitors are starting forms but not finishing them.");
  }

  if (input.totals.validation_failed > 0) {
    highlights.push(`Validation failures were recorded ${input.totals.validation_failed} time${input.totals.validation_failed === 1 ? "" : "s"} in this window.`);
  }

  if (input.totals.checkout_failed > 0) {
    highlights.push(`Checkout failures were recorded ${input.totals.checkout_failed} time${input.totals.checkout_failed === 1 ? "" : "s"} in this window.`);
  }

  if (input.totals.checkout_completed > 0) {
    highlights.push(`Completed checkouts were recorded ${input.totals.checkout_completed} time${input.totals.checkout_completed === 1 ? "" : "s"} in this window.`);
  }

  if (input.totals.save_failed > 0 || input.totals.publish_failed > 0) {
    highlights.push(`Builder friction is visible too: ${input.totals.save_failed} save failure${input.totals.save_failed === 1 ? "" : "s"} and ${input.totals.publish_failed} publish failure${input.totals.publish_failed === 1 ? "" : "s"}.`);
  }

  const leadActions = input.totals.form_submitted + input.totals.booking_created + Math.max(input.totals.checkout_started, input.totals.checkout_completed);
  if (input.totals.cta_click > 0 && leadActions === 0) {
    highlights.push("CTA clicks are happening, but nobody is making it to form submit, booking, or checkout.");
  }

  if (input.totals.add_to_cart > 0 && input.totals.checkout_started === 0) {
    highlights.push("Cart intent is showing up, but checkout is not starting afterward.");
  }

  const weakTrafficPage = input.pages.find((page) => page.metrics.page_view >= 10 && page.metrics.cta_click === 0);
  if (weakTrafficPage) {
    highlights.push(`${weakTrafficPage.title || weakTrafficPage.slug} is getting views without any CTA engagement.`);
  }

  const dropOffPage = input.pages.find((page) => page.biggestDropOff);
  if (dropOffPage?.biggestDropOff) {
    highlights.push(`${dropOffPage.title || dropOffPage.slug}: ${dropOffPage.biggestDropOff}`);
  }

  return highlights.slice(0, 4);
}

export async function GET(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
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

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const windowDays = normalizeWindowDays(url.searchParams.get("days"));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const pages = await prisma.creditFunnelPage.findMany({
    where: { funnelId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, title: true, slug: true, sortOrder: true },
  });

  const analytics = await getCreditFunnelWindowAnalytics({ funnelId, since });
  const pageSummaries = pages.map((page) => {
    const metrics = analytics.pageMetrics.get(page.id) || createEmptyCreditFunnelEventMetrics();
    const sessionCount = analytics.pageSessions.get(page.id) || 0;
    const leadActions = metrics.form_submitted + metrics.booking_created + Math.max(metrics.checkout_started, metrics.checkout_completed);
    return {
      pageId: page.id,
      title: String(page.title || "").trim() || page.slug,
      slug: page.slug,
      sortOrder: page.sortOrder,
      sessionCount,
      metrics,
      rates: {
        ctaPerViewPct: toPct(metrics.cta_click, metrics.page_view),
        leadPerViewPct: toPct(leadActions, metrics.page_view),
        checkoutPerViewPct: toPct(metrics.checkout_started, metrics.page_view),
        checkoutCompletedPerViewPct: toPct(metrics.checkout_completed, metrics.page_view),
      },
      biggestDropOff: describePageDropOff(metrics),
    };
  });

  return NextResponse.json({
    ok: true,
    analytics: {
      trackingReady: analytics.trackingReady,
      windowDays,
      since: analytics.since,
      totalEvents: analytics.totalEvents,
      totalSessions: analytics.totalSessions,
      totals: analytics.totals,
      highlights: buildHighlights({
        trackingReady: analytics.trackingReady,
        totals: analytics.totals,
        pages: pageSummaries,
      }),
      pages: pageSummaries,
    },
  });
}