import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { findOrCreatePortalContact } from "@/lib/portalContacts";

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
    if (!site) return NextResponse.json({ ok: true, upcoming: [], recent: [] });

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

    // Best-effort backfill of contactId for existing rows.
    if (hasContactId) {
      const all = [...(upcoming || []), ...(recent || [])] as any[];
      const missing = all.filter((b) => !b.contactId && typeof b.contactName === "string" && b.contactName.trim());

      // Keep this small to avoid slow responses.
      for (const b of missing.slice(0, 15)) {
        try {
          const contactId = await findOrCreatePortalContact({
            ownerId,
            name: String(b.contactName || "").slice(0, 80),
            email: b.contactEmail ? String(b.contactEmail) : null,
            phone: b.contactPhone ? String(b.contactPhone) : null,
          });
          if (!contactId) continue;

          await prisma.portalBooking.updateMany({
            where: { id: String(b.id), siteId: site.id },
            data: { contactId },
          });

          b.contactId = contactId;
        } catch {
          // ignore
        }
      }
    }

    const all = [...(upcoming || []), ...(recent || [])] as any[];
    const contactIds = Array.from(
      new Set(all.map((b) => String((b as any).contactId || "")).filter(Boolean)),
    );

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

        for (const r of rows || []) {
          const cid = String(r.contactId);
          const t = r.tag;
          if (!t) continue;
          const list = tagsByContactId.get(cid) || [];
          list.push({ id: String(t.id), name: String(t.name), color: t.color ? String(t.color) : null });
          tagsByContactId.set(cid, list);
        }
      } catch {
        // ignore
      }
    }

    function withTags(list: any[]) {
      return (list || []).map((b: any) => ({
        ...b,
        contactId: b.contactId ? String(b.contactId) : null,
        contactTags: b.contactId ? tagsByContactId.get(String(b.contactId)) || [] : [],
      }));
    }

    return NextResponse.json({ ok: true, upcoming: withTags(upcoming as any), recent: withTags(recent as any) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
