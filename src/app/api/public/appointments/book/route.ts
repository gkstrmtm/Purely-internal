import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

const bodySchema = z.object({
  requestId: z.string().min(1),
  startAt: z.string().min(1),
  durationMinutes: z.number().int().min(10).max(180).default(30),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

async function getMarketingSetterId() {
  const email = process.env.MARKETING_SETTER_EMAIL;
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }

  const fallback = await prisma.user.findFirst({
    where: { active: true, role: { in: ["MANAGER", "ADMIN", "DIALER"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return fallback?.id ?? null;
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    const field = first?.path?.[0];

    let message = "Please check your details and try again.";
    if (field === "requestId") message = "We could not find your request. Please try again.";
    if (field === "startAt") message = "Please choose a time and try again.";
    if (field === "durationMinutes") message = "Please choose a time and try again.";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const request = await prisma.marketingDemoRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { id: true, leadId: true },
  });
  if (!request) {
    return NextResponse.json(
      { error: "We could not find your request. Please try again." },
      { status: 404 },
    );
  }

  const setterId = await getMarketingSetterId();
  if (!setterId) {
    return NextResponse.json(
      { error: "Booking is temporarily unavailable. Please try again soon." },
      { status: 500 },
    );
  }

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Please choose a valid time." }, { status: 400 });
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
    select: { userId: true },
  });

  const eligibleCloserIds = new Set(blocks.map((b) => b.userId));
  const eligible = closers.filter((c) => eligibleCloserIds.has(c.id));

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "That time just became unavailable. Please choose a different time." },
      { status: 409 },
    );
  }

  // Remove closers with conflicting scheduled appointments.
  const conflicts = await prisma.appointment.findMany({
    where: {
      closerId: { in: eligible.map((c) => c.id) },
      status: "SCHEDULED",
      OR: [{ startAt: { lt: endAt }, endAt: { gt: startAt } }],
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
      { error: "That time just became unavailable. Please choose a different time." },
      { status: 409 },
    );
  }

  // Fairness: choose closer with lowest scheduled count.
  const counts = await prisma.appointment.groupBy({
    by: ["closerId"],
    where: {
      closerId: { in: noConflict.map((c) => c.id) },
      status: "SCHEDULED",
      startAt: { gte: new Date(Date.now() - 1 * 24 * 60 * 60_000) },
    },
    _count: { _all: true },
  });

  const countMap = new Map(counts.map((c) => [c.closerId, c._count._all] as const));

  let chosen = noConflict[0];
  for (const c of noConflict) {
    const curr = countMap.get(c.id) ?? 0;
    const best = countMap.get(chosen.id) ?? 0;
    if (curr < best) chosen = c;
  }

  const appointment = await prisma.appointment.create({
    data: {
      leadId: request.leadId,
      setterId,
      closerId: chosen.id,
      startAt,
      endAt,
    },
    include: {
      lead: true,
      closer: { select: { name: true, email: true } },
      setter: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ appointment });
}
