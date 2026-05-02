import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await requireClientSessionForService("booking");
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: auth.status },
      );
    }

    const ownerId = auth.session.user.id;
    const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true } });
    const config = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1, calendars: [] }));

    if (!site) {
      return NextResponse.json({ ok: true, config, upcoming: [], recent: [] });
    }

    const now = new Date();

    await ensurePortalContactTagsReady().catch(() => null);

    const [hasCalendarId, hasContactId] = await Promise.all([
      hasPublicColumn("PortalBooking", "calendarId"),
      hasPublicColumn("PortalBooking", "contactId"),
    ]);

    const select: Record<string, boolean> = {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      notes: true,
      createdAt: true,
      canceledAt: true,
    };

    if (hasCalendarId) select.calendarId = true;
    if (hasContactId) select.contactId = true;

    const [upcoming, recent] = await Promise.all([
      prisma.portalBooking.findMany({
        where: { siteId: site.id, status: "SCHEDULED", startAt: { gte: now } },
        orderBy: { startAt: "asc" },
        take: 25,
        select: select as any,
      }),
      prisma.portalBooking.findMany({
        where: { siteId: site.id, OR: [{ status: "CANCELED" }, { startAt: { lt: now } }] },
        orderBy: { startAt: "desc" },
        take: 25,
        select: select as any,
      }),
    ]);

    const all = [...(upcoming || []), ...(recent || [])] as any[];
    const contactIds = Array.from(new Set(all.map((b) => String((b as any).contactId || "")).filter(Boolean)));

    const tagsByContactId = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
    if (contactIds.length) {
      try {
        const rows = await (prisma as any).portalContactTagAssignment.findMany({
          where: { ownerId, contactId: { in: contactIds } },
          take: 4000,
          select: {
            contactId: true,
            tag: { select: { id: true, name: true, color: true } },
          },
        });

        for (const row of rows || []) {
          const cid = String(row.contactId);
          const tag = row.tag;
          if (!tag) continue;
          const list = tagsByContactId.get(cid) || [];
          list.push({ id: String(tag.id), name: String(tag.name), color: tag.color ? String(tag.color) : null });
          tagsByContactId.set(cid, list);
        }
      } catch {
        // ignore
      }
    }

    const withTags = (list: any[]) =>
      (list || []).map((booking: any) => ({
        ...booking,
        contactId: booking.contactId ? String(booking.contactId) : null,
        contactTags: booking.contactId ? tagsByContactId.get(String(booking.contactId)) || [] : [],
      }));

    return NextResponse.json({ ok: true, config, upcoming: withTags(upcoming as any), recent: withTags(recent as any) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
