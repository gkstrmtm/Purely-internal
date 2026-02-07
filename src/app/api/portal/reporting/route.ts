import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getCreditsState } from "@/lib/credits";
import { listAiReceptionistEvents } from "@/lib/aiReceptionist";
import { listMissedCallTextBackEvents } from "@/lib/missedCallTextBack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

function clampRangeKey(value: string | null): RangeKey {
  switch ((value ?? "").toLowerCase().trim()) {
    case "today":
      return "today";
    case "7d":
    case "7":
      return "7d";
    case "30d":
    case "30":
      return "30d";
    case "90d":
    case "90":
      return "90d";
    case "all":
      return "all";
    default:
      return "30d";
  }
}

function startForRange(range: RangeKey, now: Date): Date {
  if (range === "all") return new Date(0);
  if (range === "today") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function dayKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const range = clampRangeKey(url.searchParams.get("range"));
  const now = new Date();
  const start = startForRange(range, now);

  const warnings: string[] = [];

  async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      console.error(`/api/portal/reporting: ${label} failed`, err);
      warnings.push(label);
      return fallback;
    }
  }

  const [credits, aiEventsRaw, missedEventsRaw, leadRuns, bookingSite, reviewsAgg, leadsCount, contactsCount] =
    await Promise.all([
      safe("credits", () => getCreditsState(ownerId), { balance: 0, autoTopUp: false }),
      safe("aiEvents", () => listAiReceptionistEvents(ownerId, 200), []),
      safe("missedCallEvents", () => listMissedCallTextBackEvents(ownerId, 200), []),
      safe(
        "leadScrapeRuns",
        () =>
          prisma.portalLeadScrapeRun.findMany({
            where: { ownerId, createdAt: { gte: start } },
            select: {
              id: true,
              createdAt: true,
              requestedCount: true,
              createdCount: true,
              chargedCredits: true,
              refundedCredits: true,
              error: true,
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          }),
        [],
      ),
      safe("bookingSite", () => prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true } }), null),
      safe(
        "reviewsAgg",
        () =>
          prisma.portalReview.aggregate({
            where: { ownerId, createdAt: { gte: start }, archivedAt: null },
            _count: { id: true },
            _avg: { rating: true },
          }),
        { _count: { id: 0 }, _avg: { rating: null } },
      ),
      safe("leadsCount", () => prisma.portalLead.count({ where: { ownerId, createdAt: { gte: start } } }), 0),
      safe("contactsCount", () => prisma.portalContact.count({ where: { ownerId, createdAt: { gte: start } } }), 0),
    ]);

  const bookingCount = bookingSite
    ? await safe(
        "bookingCount",
        () => prisma.portalBooking.count({ where: { siteId: bookingSite.id, createdAt: { gte: start } } }),
        0,
      )
    : 0;

  const aiEvents = aiEventsRaw.filter((e) => {
    const d = safeDate(e.createdAtIso);
    return d ? d >= start : false;
  });

  const missedEvents = missedEventsRaw.filter((e) => {
    const d = safeDate(e.createdAtIso);
    return d ? d >= start : false;
  });

  const aiCompleted = aiEvents.filter((e) => e.status === "COMPLETED").length;
  const aiFailed = aiEvents.filter((e) => e.status === "FAILED").length;
  const missedCalls = missedEvents.filter((e) => e.finalStatus === "MISSED").length;
  const textsSent = missedEvents.filter((e) => e.smsStatus === "SENT").length;
  const textsFailed = missedEvents.filter((e) => e.smsStatus === "FAILED").length;

  const aiCreditsUsed = aiEvents.reduce((sum, e) => sum + (typeof e.chargedCredits === "number" ? e.chargedCredits : 0), 0);
  const leadScrapeRuns = leadRuns.length;
  const leadScrapeCharged = leadRuns.reduce((sum, r) => sum + (r.chargedCredits || 0), 0);
  const leadScrapeRefunded = leadRuns.reduce((sum, r) => sum + (r.refundedCredits || 0), 0);
  const leadScrapeNetCredits = Math.max(0, leadScrapeCharged - leadScrapeRefunded);

  const creditsUsed = aiCreditsUsed + leadScrapeNetCredits;

  const automationsRun = aiEvents.length + missedEvents.length + leadScrapeRuns;

  // Daily breakdown (UTC) for charting/table.
  const daysBack = range === "today" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 30;
  const dailyMap = new Map<
    string,
    { day: string; aiCalls: number; missedCalls: number; leadScrapeRuns: number; bookings: number; reviews: number; creditsUsed: number }
  >();

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayKeyUtc(d);
    dailyMap.set(key, { day: key, aiCalls: 0, missedCalls: 0, leadScrapeRuns: 0, bookings: 0, reviews: 0, creditsUsed: 0 });
  }

  for (const e of aiEvents) {
    const d = safeDate(e.createdAtIso);
    if (!d) continue;
    const key = dayKeyUtc(d);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.aiCalls += 1;
    row.creditsUsed += typeof e.chargedCredits === "number" ? e.chargedCredits : 0;
  }

  for (const e of missedEvents) {
    const d = safeDate(e.createdAtIso);
    if (!d) continue;
    const key = dayKeyUtc(d);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.missedCalls += e.finalStatus === "MISSED" ? 1 : 0;
  }

  for (const r of leadRuns) {
    const key = dayKeyUtc(r.createdAt);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.leadScrapeRuns += 1;
    const net = Math.max(0, (r.chargedCredits || 0) - (r.refundedCredits || 0));
    row.creditsUsed += net;
  }

  if (bookingSite) {
    const bookings = await prisma.portalBooking.findMany({
      where: { siteId: bookingSite.id, createdAt: { gte: start } },
      select: { createdAt: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    for (const b of bookings) {
      const key = dayKeyUtc(b.createdAt);
      const row = dailyMap.get(key);
      if (!row) continue;
      row.bookings += 1;
    }
  }

  const reviews = await safe(
    "reviewsList",
    () =>
      prisma.portalReview.findMany({
        where: { ownerId, createdAt: { gte: start }, archivedAt: null },
        select: { createdAt: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
    [],
  );
  for (const r of reviews) {
    const key = dayKeyUtc(r.createdAt);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.reviews += 1;
  }

  const daily = Array.from(dailyMap.values());

  return NextResponse.json({
    ok: true,
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    creditsRemaining: credits.balance,
    ...(warnings.length ? { warnings } : {}),
    kpis: {
      automationsRun,
      aiCalls: aiEvents.length,
      aiCompleted,
      aiFailed,
      missedCallAttempts: missedEvents.length,
      missedCalls,
      textsSent,
      textsFailed,
      leadScrapeRuns,
      leadScrapeChargedCredits: leadScrapeCharged,
      leadScrapeRefundedCredits: leadScrapeRefunded,
      creditsUsed,
      bookingsCreated: bookingCount,
      reviewsCollected: reviewsAgg._count.id,
      avgReviewRating: reviewsAgg._avg.rating,
      leadsCreated: leadsCount,
      contactsCreated: contactsCount,
    },
    daily,
  });
}
