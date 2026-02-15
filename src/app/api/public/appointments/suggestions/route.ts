import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

const querySchema = z.object({
  startAt: z.string().optional(),
  days: z.coerce.number().int().min(1).max(30).default(14),
  durationMinutes: z.coerce.number().int().min(10).max(180).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function alignToNextHalfHour(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const minutes = x.getMinutes();
  const mod = minutes % 30;
  if (mod !== 0) x.setMinutes(minutes + (30 - mod));
  return x;
}

export async function GET(req: Request) {
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

  const now = new Date();
  const base = parsed.data.startAt ? new Date(parsed.data.startAt) : now;
  const rangeStart = Number.isNaN(base.getTime()) ? now : base;
  const safeStart = rangeStart < now ? now : rangeStart;
  const alignedStart = alignToNextHalfHour(safeStart);
  const rangeEnd = new Date(alignedStart.getTime() + parsed.data.days * 24 * 60 * 60_000);

  const eligibleRoles = ["CLOSER", "MANAGER", "ADMIN"] as const;

  // Only consider users who have availability blocks in-range.
  const candidateBlocks = await prisma.availabilityBlock.findMany({
    where: {
      startAt: { lt: rangeEnd },
      endAt: { gt: alignedStart },
    },
    select: { userId: true, startAt: true, endAt: true },
  });

  const candidateUserIds = Array.from(new Set(candidateBlocks.map((b) => b.userId)));
  if (candidateUserIds.length === 0) return NextResponse.json({ slots: [] });

  const closers = await prisma.user.findMany({
    where: { id: { in: candidateUserIds }, active: true, role: { in: eligibleRoles as any } },
    select: { id: true },
  });
  const closerIds = closers.map((c) => c.id);
  if (closerIds.length === 0) return NextResponse.json({ slots: [] });

  const closerIdSet = new Set(closerIds);
  const blocks = candidateBlocks.filter((b) => closerIdSet.has(b.userId));

  const appts = await prisma.appointment.findMany({
    where: {
      closerId: { in: closerIds },
      status: "SCHEDULED",
      startAt: { lt: rangeEnd },
      endAt: { gt: alignedStart },
    },
    select: { closerId: true, startAt: true, endAt: true },
  });

  const blocksByUser = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
  for (const b of blocks) {
    const list = blocksByUser.get(b.userId) ?? [];
    list.push({ startAt: b.startAt, endAt: b.endAt });
    blocksByUser.set(b.userId, list);
  }

  const apptsByUser = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
  for (const a of appts) {
    const list = apptsByUser.get(a.closerId) ?? [];
    list.push({ startAt: a.startAt, endAt: a.endAt });
    apptsByUser.set(a.closerId, list);
  }

  function hasCoverage(userId: string, start: Date, end: Date) {
    const bs = blocksByUser.get(userId) ?? [];
    for (const b of bs) {
      if (b.startAt <= start && b.endAt >= end) return true;
    }
    return false;
  }

  function hasConflict(userId: string, start: Date, end: Date) {
    const cs = apptsByUser.get(userId) ?? [];
    for (const c of cs) {
      if (overlaps(start, end, c.startAt, c.endAt)) return true;
    }
    return false;
  }

  const slots: Array<{ startAt: string; endAt: string; closerCount: number }> = [];
  const durationMs = parsed.data.durationMinutes * 60_000;

  for (
    let cur = new Date(alignedStart);
    cur.getTime() + durationMs <= rangeEnd.getTime();
    cur = new Date(cur.getTime() + 30 * 60_000)
  ) {
    const end = new Date(cur.getTime() + durationMs);

    let closerCount = 0;
    for (const id of closerIds) {
      if (!hasCoverage(id, cur, end)) continue;
      if (hasConflict(id, cur, end)) continue;
      closerCount++;
    }

    if (closerCount > 0) {
      slots.push({ startAt: cur.toISOString(), endAt: end.toISOString(), closerCount });
      if (slots.length >= parsed.data.limit) break;
    }
  }

  return NextResponse.json({ slots });
}
