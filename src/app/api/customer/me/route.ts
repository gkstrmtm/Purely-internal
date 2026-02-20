import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStripeConfigured } from "@/lib/stripeFetch";
import type { Entitlements } from "@/lib/entitlements";
import { resolveEntitlements } from "@/lib/entitlements";
import { getPortalUser } from "@/lib/portalAuth";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";
import { listAiReceptionistEvents, type AiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { listMissedCallTextBackEvents, type MissedCallTextBackEvent } from "@/lib/missedCallTextBack";

function safeDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function hoursFromMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return minutes / 60;
}

async function computeHoursSaved(ownerId: string): Promise<{ hoursSavedThisWeek: number; hoursSavedAllTime: number }> {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  const [aiEventsRaw, missedEventsRaw] = await Promise.all([
    safe(() => listAiReceptionistEvents(ownerId, 200), [] as AiReceptionistCallEvent[]),
    safe(() => listMissedCallTextBackEvents(ownerId, 200), [] as MissedCallTextBackEvent[]),
  ]);

  const aiCompletedAll = aiEventsRaw.filter((e) => String(e.status || "").toUpperCase() === "COMPLETED").length;
  const aiCompletedWeek = aiEventsRaw.filter((e) => {
    if (String(e.status || "").toUpperCase() !== "COMPLETED") return false;
    const d = safeDate(e.createdAtIso);
    return d ? d >= weekStart : false;
  }).length;

  const missedAll = missedEventsRaw.length;
  const missedWeek = missedEventsRaw.filter((e) => {
    const d = safeDate(e.createdAtIso);
    return d ? d >= weekStart : false;
  }).length;

  const [leadScrapeWeekAgg, leadScrapeAllAgg] = await Promise.all([
    safe(
      () =>
        prisma.portalLeadScrapeRun.aggregate({
          where: { ownerId, createdAt: { gte: weekStart } },
          _sum: { createdCount: true },
        }),
      { _sum: { createdCount: 0 } },
    ),
    safe(
      () =>
        prisma.portalLeadScrapeRun.aggregate({
          where: { ownerId },
          _sum: { createdCount: true },
        }),
      { _sum: { createdCount: 0 } },
    ),
  ]);

  const leadsCreatedWeek = Math.max(0, Number(leadScrapeWeekAgg?._sum?.createdCount ?? 0) || 0);
  const leadsCreatedAll = Math.max(0, Number(leadScrapeAllAgg?._sum?.createdCount ?? 0) || 0);

  const [aiOutboundWeek, aiOutboundAll] = await Promise.all([
    safe(
      () =>
        prisma.portalAiOutboundCallEnrollment.count({
          where: { ownerId, status: "COMPLETED", completedAt: { gte: weekStart } },
        }),
      0,
    ),
    safe(
      () =>
        prisma.portalAiOutboundCallEnrollment.count({
          where: { ownerId, status: "COMPLETED" },
        }),
      0,
    ),
  ]);

  const [blogWeek, blogAll, newsletterWeek, newsletterAll] = await Promise.all([
    safe(
      () => prisma.portalBlogGenerationEvent.count({ where: { ownerId, createdAt: { gte: weekStart } } }),
      0,
    ),
    safe(
      () => prisma.portalBlogGenerationEvent.count({ where: { ownerId } }),
      0,
    ),
    safe(
      () => prisma.portalNewsletterSendEvent.count({ where: { ownerId, createdAt: { gte: weekStart }, sentCount: { gt: 0 } } }),
      0,
    ),
    safe(
      () => prisma.portalNewsletterSendEvent.count({ where: { ownerId, sentCount: { gt: 0 } } }),
      0,
    ),
  ]);

  const bookingSite = await safe(
    () => prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true } }),
    null as { id: string } | null,
  );

  const [bookingsWeek, bookingsAll] = bookingSite
    ? await Promise.all([
        safe(
          () => prisma.portalBooking.count({ where: { siteId: bookingSite.id, createdAt: { gte: weekStart } } }),
          0,
        ),
        safe(() => prisma.portalBooking.count({ where: { siteId: bookingSite.id } }), 0),
      ])
    : [0, 0];

  // Heuristics (minutes saved per activity). Intentionally conservative.
  const minutesWeek =
    aiCompletedWeek * 4 +
    missedWeek * 2 +
    leadsCreatedWeek * 3 +
    aiOutboundWeek * 2.5 +
    bookingsWeek * 6 +
    blogWeek * 45 +
    newsletterWeek * 20;

  const minutesAll =
    aiCompletedAll * 4 +
    missedAll * 2 +
    leadsCreatedAll * 3 +
    aiOutboundAll * 2.5 +
    bookingsAll * 6 +
    blogAll * 45 +
    newsletterAll * 20;

  return {
    hoursSavedThisWeek: hoursFromMinutes(minutesWeek),
    hoursSavedAllTime: hoursFromMinutes(minutesAll),
  };
}

export async function GET(req: Request) {
  // This endpoint is used by both the employee app and the client portal.
  // IMPORTANT: in the same browser, both auth cookies can coexist. Portal requests must
  // explicitly bind to the portal cookie to avoid being treated as an employee session.
  const app = (req.headers.get("x-pa-app") ?? "").toLowerCase().trim();

  const portalVariant = (() => {
    const headerVariant = normalizePortalVariant(req.headers.get(PORTAL_VARIANT_HEADER));
    if (headerVariant) return headerVariant;
    const referer = String(req.headers.get("referer") || "");
    try {
      const u = new URL(referer);
      return u.pathname === "/credit" || u.pathname.startsWith("/credit/") ? "credit" : "portal";
    } catch {
      return referer === "/credit" || referer.startsWith("/credit/") ? "credit" : "portal";
    }
  })();

  const user =
    app === "portal"
      ? await (async () => {
          const portalUser = await getPortalUser({ variant: portalVariant });
          return portalUser
            ? { email: portalUser.email, name: portalUser.name ?? "", role: portalUser.role }
            : null;
        })()
      : await (async () => {
          const session = await getServerSession(authOptions);
          const employeeUser = session?.user ?? null;
          return employeeUser
            ? { email: employeeUser.email ?? "", name: employeeUser.name ?? "", role: employeeUser.role }
            : null;
        })();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let entitlementsEmail = user.email;
  let ownerIdForEntitlements: string | null = null;
  if (app === "portal") {
    const portalUser = await getPortalUser({ variant: portalVariant }).catch(() => null);
    const ownerId = portalUser?.id ? String(portalUser.id) : null;
    ownerIdForEntitlements = ownerId;
    if (ownerId) {
      const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } }).catch(() => null);
      if (owner?.email) entitlementsEmail = String(owner.email);
    }
  }

  const entitlements: Entitlements = await resolveEntitlements(entitlementsEmail, { ownerId: ownerIdForEntitlements });

  const metricsOwnerId = ownerIdForEntitlements
    ? ownerIdForEntitlements
    : await prisma.user
        .findUnique({ where: { email: user.email }, select: { id: true } })
        .then((u) => u?.id ?? null)
        .catch(() => null);

  const metrics = metricsOwnerId ? await computeHoursSaved(metricsOwnerId) : { hoursSavedThisWeek: 0, hoursSavedAllTime: 0 };

  return NextResponse.json({
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
    entitlements,
    metrics,
    billing: {
      configured: isStripeConfigured(),
    },
  });
}
