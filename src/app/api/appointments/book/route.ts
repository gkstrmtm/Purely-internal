import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

const bodySchema = z.object({
  leadId: z.string().min(1),
  startAt: z.string().min(1),
  durationMinutes: z.number().int().min(10).max(180).default(30),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const setterId = session?.user?.id;
    const role = session?.user?.role;
    if (!setterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (role !== "DIALER" && role !== "ADMIN" && role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const [hasContactPhone, hasInterestedService, hasNotes, hasWebsite, hasLocation, hasNiche] =
      await Promise.all([
      hasPublicColumn("Lead", "contactPhone"),
      hasPublicColumn("Lead", "interestedService"),
      hasPublicColumn("Lead", "notes"),
      hasPublicColumn("Lead", "website"),
      hasPublicColumn("Lead", "location"),
      hasPublicColumn("Lead", "niche"),
    ]);

    const leadSelect = {
      id: true,
      businessName: true,
      phone: true,
      contactName: true,
      contactEmail: true,
      ...(hasWebsite ? { website: true } : {}),
      ...(hasNiche ? { niche: true } : {}),
      ...(hasLocation ? { location: true } : {}),
      ...(hasContactPhone ? { contactPhone: true } : {}),
      ...(hasInterestedService ? { interestedService: true } : {}),
      ...(hasNotes ? { notes: true } : {}),
    } as const;

    const lead = await prisma.lead.findUnique({
      where: { id: parsed.data.leadId },
      select: leadSelect,
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const startAt = new Date(parsed.data.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    }
    const endAt = new Date(startAt.getTime() + parsed.data.durationMinutes * 60_000);

  // Find available closers:
  const closers = await prisma.user.findMany({
    where: { role: "CLOSER", active: true },
    select: { id: true, name: true },
  });

  // Preload their availability blocks that could contain the slot.
  const blocks = await prisma.availabilityBlock.findMany({
    where: {
      userId: { in: closers.map((c) => c.id) },
      startAt: { lte: startAt },
      endAt: { gte: endAt },
    },
    select: { userId: true, startAt: true, endAt: true },
  });

  const eligibleCloserIds = new Set(blocks.map((b) => b.userId));
  const eligible = closers.filter((c) => eligibleCloserIds.has(c.id));

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "No closers available for that time" },
      { status: 409 },
    );
  }

  // Remove closers with conflicting scheduled appointments.
  const conflicts = await prisma.appointment.findMany({
    where: {
      closerId: { in: eligible.map((c) => c.id) },
      status: "SCHEDULED",
      OR: [
        { startAt: { lt: endAt }, endAt: { gt: startAt } },
      ],
    },
    select: { closerId: true, startAt: true, endAt: true },
  });

  const conflictSet = new Set<string>();
  for (const c of conflicts) {
    if (overlaps(startAt, endAt, c.startAt, c.endAt)) conflictSet.add(c.closerId);
  }

  const noConflict = eligible.filter((c) => !conflictSet.has(c.id));
  if (noConflict.length === 0) {
    return NextResponse.json(
      { error: "All eligible closers are booked at that time" },
      { status: 409 },
    );
  }

  // Fairness: choose closer with lowest scheduled count in the next 7 days.
  const counts = await prisma.appointment.groupBy({
    by: ["closerId"],
    where: {
      closerId: { in: noConflict.map((c) => c.id) },
      status: "SCHEDULED",
      startAt: { gte: new Date(Date.now() - 1 * 24 * 60 * 60_000) },
    },
    _count: { _all: true },
  });

  const countMap = new Map(counts.map((c) => [c.closerId, c._count._all]));

  let chosen = noConflict[0];
  for (const c of noConflict) {
    const curr = countMap.get(c.id) ?? 0;
    const best = countMap.get(chosen.id) ?? 0;
    if (curr < best) chosen = c;
  }

    const appointment = await prisma.appointment.create({
      data: {
        leadId: lead.id,
        setterId,
        closerId: chosen.id,
        startAt,
        endAt,
      },
      select: {
        id: true,
        leadId: true,
        startAt: true,
        endAt: true,
        status: true,
        lead: { select: leadSelect },
        closer: { select: { name: true, email: true } },
        setter: { select: { name: true, email: true } },
      },
    });

    const leadRec = appointment.lead as unknown as Record<string, unknown>;
    const notes = leadRec.notes;
    const interestedServiceRaw = leadRec.interestedService;
    const interestedService =
      typeof interestedServiceRaw === "string" && interestedServiceRaw.trim()
        ? interestedServiceRaw
        : deriveInterestedServiceFromNotes(notes);

    const contactPhoneRaw = leadRec.contactPhone;
    const contactPhone =
      typeof contactPhoneRaw === "string" && contactPhoneRaw.trim() ? contactPhoneRaw : null;

    return NextResponse.json({
      appointment: {
        ...appointment,
        lead: { ...appointment.lead, contactPhone, interestedService },
      },
    });
  } catch (err) {
    console.error("/api/appointments/book failed", err);
    return NextResponse.json({ error: "Failed to book meeting" }, { status: 500 });
  }
}
