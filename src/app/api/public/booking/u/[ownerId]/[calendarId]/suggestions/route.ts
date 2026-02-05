import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { computeAvailableSlots } from "@/lib/bookingSlots";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  startAt: z.string().optional(),
  days: z.coerce.number().int().min(1).max(30).default(14),
  durationMinutes: z.coerce.number().int().min(10).max(180).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ownerId: string; calendarId: string }> },
) {
  const { ownerId, calendarId } = await params;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    startAt: url.searchParams.get("startAt") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
    durationMinutes: url.searchParams.get("durationMinutes") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const [site, calendars] = await Promise.all([
    (prisma as any).portalBookingSite.findUnique({
      where: { ownerId },
      select: { id: true, ownerId: true, enabled: true },
    }),
    getBookingCalendarsConfig(ownerId),
  ]);

  const cal = calendars.calendars.find((c) => c.id === calendarId);
  if (!site || !site.enabled || !cal || !cal.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const durationMinutes = cal.durationMinutes ?? parsed.data.durationMinutes;

  const now = new Date();
  const base = parsed.data.startAt ? new Date(parsed.data.startAt) : now;
  const rangeStart = Number.isNaN(base.getTime()) ? now : base;
  const rangeEnd = new Date(rangeStart.getTime() + parsed.data.days * 24 * 60 * 60_000);

  const [blocks, bookings] = await Promise.all([
    prisma.availabilityBlock.findMany({
      where: { userId: site.ownerId, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { startAt: true, endAt: true },
    }),
    (prisma as any).portalBooking.findMany({
      where: { siteId: site.id, status: "SCHEDULED", startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const slots = computeAvailableSlots({
    startAt: parsed.data.startAt ?? null,
    days: parsed.data.days,
    durationMinutes,
    limit: parsed.data.limit,
    coverageBlocks: blocks,
    existing: bookings,
  });

  return NextResponse.json({ ok: true, slots });
}
