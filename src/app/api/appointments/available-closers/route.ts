import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  startAt: z.string().min(1),
  durationMinutes: z.coerce.number().int().min(10).max(180).default(30),
  excludeAppointmentId: z.string().optional(),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    startAt: url.searchParams.get("startAt") ?? "",
    durationMinutes: url.searchParams.get("durationMinutes") ?? undefined,
    excludeAppointmentId: url.searchParams.get("excludeAppointmentId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
  }
  const endAt = new Date(startAt.getTime() + parsed.data.durationMinutes * 60_000);

  const closers = await prisma.user.findMany({
    where: { role: "CLOSER", active: true },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  if (closers.length === 0) return NextResponse.json({ closers: [] });

  const closerIds = closers.map((c) => c.id);

  const blocks = await prisma.availabilityBlock.findMany({
    where: {
      userId: { in: closerIds },
      startAt: { lte: startAt },
      endAt: { gte: endAt },
    },
    select: { userId: true, startAt: true, endAt: true },
  });

  const eligibleByCoverage = new Set(blocks.map((b) => b.userId));
  const covered = closers.filter((c) => eligibleByCoverage.has(c.id));
  if (covered.length === 0) return NextResponse.json({ closers: [] });

  const conflicts = await prisma.appointment.findMany({
    where: {
      id: parsed.data.excludeAppointmentId
        ? { not: parsed.data.excludeAppointmentId }
        : undefined,
      closerId: { in: covered.map((c) => c.id) },
      status: { in: ["SCHEDULED", "RESCHEDULED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { closerId: true, startAt: true, endAt: true },
  });

  const conflictSet = new Set<string>();
  for (const c of conflicts) {
    if (overlaps(startAt, endAt, c.startAt, c.endAt)) conflictSet.add(c.closerId);
  }

  const available = covered.filter((c) => !conflictSet.has(c.id));
  return NextResponse.json({ closers: available });
}
