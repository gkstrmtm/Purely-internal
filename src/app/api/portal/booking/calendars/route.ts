import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { prisma } from "@/lib/db";
import { createQuickBookingCalendar, getBookingCalendarsConfig, setBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { consumeCredits } from "@/lib/credits";
import { ensureFunnelBookingCalendar } from "@/lib/funnelBookingCalendars";
import { resolveFunnelBookingDefaults } from "@/lib/funnelBookingDefaults";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  calendars: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(50),
        enabled: z.boolean().optional(),
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().max(400).optional(),
        durationMinutes: z.number().int().min(10).max(180).optional(),
        minimumNoticeMinutes: z.number().int().min(0).max(60 * 24 * 14).optional(),
        meetingLocation: z.string().trim().max(120).optional(),
        meetingDetails: z.string().trim().max(600).optional(),
        notificationEmails: z.array(z.string().trim().email()).max(20).optional(),
      }),
    )
    .max(25),
});

const postSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).optional(),
  funnelId: z.string().trim().min(1).max(120).optional(),
  funnelName: z.string().trim().max(120).optional(),
  pageTitle: z.string().trim().max(120).optional(),
  bookingDefaults: z
    .object({
      presetId: z.string().trim().max(80).optional(),
      durationMinutes: z.number().int().min(10).max(180).optional(),
      minimumNoticeMinutes: z.number().int().min(0).max(60 * 24 * 14).optional(),
      availabilityTemplateId: z.string().trim().max(80).optional(),
      timeZone: z.string().trim().max(80).optional(),
    })
    .optional(),
});

async function requireBookingCalendarsAccess() {
  const bookingAuth = await requireClientSessionForService("booking");
  if (bookingAuth.ok) return bookingAuth;

  const funnelAuth = await requireFunnelBuilderSession();
  if (funnelAuth.ok) return funnelAuth;

  return bookingAuth.status === 401 && funnelAuth.status !== 401 ? funnelAuth : bookingAuth;
}

export async function GET() {
  const auth = await requireBookingCalendarsAccess();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const config = await getBookingCalendarsConfig(ownerId);
  return NextResponse.json({ ok: true, config });
}

export async function POST(req: Request) {
  const auth = await requireBookingCalendarsAccess();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const funnelId = parsed.data.funnelId?.trim() || "";
  if (funnelId) {
    const funnel = await prisma.creditFunnel.findFirst({
      where: { id: funnelId, ownerId },
      select: { id: true, name: true },
    });
    if (!funnel) {
      return NextResponse.json({ ok: false, error: "Funnel not found" }, { status: 404 });
    }

    const ensured = await ensureFunnelBookingCalendar({
      ownerId,
      funnelId,
      funnelName: parsed.data.funnelName || funnel.name,
      pageTitle: parsed.data.pageTitle,
      requestedTitle: parsed.data.title,
      requestedDescription: parsed.data.description,
      bookingDefaults: parsed.data.bookingDefaults ? resolveFunnelBookingDefaults(parsed.data.bookingDefaults) : null,
    });
    if (!ensured.ok) {
      return NextResponse.json({ ok: false, error: ensured.error }, { status: ensured.status });
    }

    return NextResponse.json({
      ok: true,
      calendar: ensured.calendar,
      config: ensured.config,
      bookingCalendarId: ensured.calendar.id,
      routingUpdated: ensured.routingUpdated,
      created: ensured.created,
    });
  }

  const created = await createQuickBookingCalendar(ownerId, parsed.data);
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: created.status });
  }

  return NextResponse.json({ ok: true, calendar: created.calendar, config: created.config });
}

export async function PUT(req: Request) {
  const auth = await requireBookingCalendarsAccess();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const prev = await getBookingCalendarsConfig(ownerId).catch(() => null);
  const prevById = new Map(
    Array.isArray(prev?.calendars) ? prev.calendars.map((calendar) => [calendar.id, calendar]) : [],
  );
  const prevIds = new Set(
    Array.isArray((prev as any)?.calendars)
      ? ((prev as any).calendars as any[])
          .map((c) => (typeof c?.id === "string" ? c.id.trim() : ""))
          .filter(Boolean)
      : [],
  );

  const nextIds = parsed.data.calendars.map((c) => c.id.trim());
  const newCount = nextIds.filter((id) => id && !prevIds.has(id)).length;
  const needCredits = newCount * PORTAL_CREDIT_COSTS.bookingCalendarCreate;

  if (needCredits > 0) {
    const charged = await consumeCredits(ownerId, needCredits);
    if (!charged.ok) {
      return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
    }
  }

  const saved = await setBookingCalendarsConfig(ownerId, {
    version: 1,
    calendars: parsed.data.calendars.map((c) => ({
      ...c,
      enabled: c.enabled ?? true,
      availabilityBlocks: prevById.get(c.id)?.availabilityBlocks,
        minimumNoticeMinutes: c.minimumNoticeMinutes ?? prevById.get(c.id)?.minimumNoticeMinutes,
    })),
  });
  return NextResponse.json({ ok: true, config: saved });
}
