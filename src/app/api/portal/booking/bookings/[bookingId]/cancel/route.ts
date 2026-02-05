import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { bookingId } = await params;
  const ownerId = auth.session.user.id;

  const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.siteId !== site.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (booking.status !== "SCHEDULED") {
    return NextResponse.json({ ok: true, booking });
  }

  const updated = await prisma.portalBooking.update({
    where: { id: bookingId },
    data: { status: "CANCELED", canceledAt: new Date() },
  });

  return NextResponse.json({ ok: true, booking: updated });
}
