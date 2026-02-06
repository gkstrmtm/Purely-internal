import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await requireClientSession();
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

    const select = {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      calendarId: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      notes: true,
      createdAt: true,
      canceledAt: true,
    };

    const [upcoming, recent] = await Promise.all([
      prisma.portalBooking.findMany({
        where: { siteId: site.id, status: "SCHEDULED", startAt: { gte: now } },
        orderBy: { startAt: "asc" },
        take: 25,
        select,
      }),
      prisma.portalBooking.findMany({
        where: { siteId: site.id, OR: [{ status: "CANCELED" }, { startAt: { lt: now } }] },
        orderBy: { startAt: "desc" },
        take: 25,
        select,
      }),
    ]);

    return NextResponse.json({ ok: true, upcoming, recent });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
