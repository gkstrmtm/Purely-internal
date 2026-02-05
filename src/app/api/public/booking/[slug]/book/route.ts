import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  startAt: z.string().min(1),
  contactName: z.string().min(1).max(80),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional().nullable(),
  notes: z.string().max(1200).optional().nullable(),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  const site = await prisma.portalBookingSite.findUnique({ where: { slug } });
  if (!site || !site.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid time." }, { status: 400 });
  }

  const durationMinutes = site.durationMinutes;
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  // Ensure host has coverage at this slot.
  const coverage = await prisma.availabilityBlock.findFirst({
    where: { userId: site.ownerId, startAt: { lte: startAt }, endAt: { gte: endAt } },
    select: { id: true },
  });

  if (!coverage) {
    return NextResponse.json(
      { error: "That time just became unavailable. Please choose a different time." },
      { status: 409 },
    );
  }

  // Ensure no conflicts with existing bookings.
  const existing = await prisma.portalBooking.findMany({
    where: { siteId: site.id, status: "SCHEDULED", startAt: { lt: endAt }, endAt: { gt: startAt } },
    select: { startAt: true, endAt: true },
  });

  for (const b of existing) {
    if (overlaps(startAt, endAt, b.startAt, b.endAt)) {
      return NextResponse.json(
        { error: "That time just became unavailable. Please choose a different time." },
        { status: 409 },
      );
    }
  }

  const booking = await prisma.portalBooking.create({
    data: {
      siteId: site.id,
      startAt,
      endAt,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone?.trim() ? parsed.data.contactPhone.trim() : null,
      notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      notes: true,
    },
  });

  return NextResponse.json({ ok: true, booking });
}
