type Slot = { startAt: string; endAt: string };

type Interval = { startAt: Date; endAt: Date };

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function alignToNextHalfHour(d: Date) {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const m = out.getMinutes();
  const add = m === 0 || m === 30 ? 0 : m < 30 ? 30 - m : 60 - m;
  out.setMinutes(m + add);
  return out;
}

export function computeAvailableSlots(params: {
  startAt?: string | null;
  days: number;
  durationMinutes: number;
  minimumNoticeMinutes?: number;
  limit: number;
  coverageBlocks: Interval[];
  existing: Interval[];
}): Slot[] {
  const now = new Date();
  const base = params.startAt ? new Date(params.startAt) : now;
  const rangeStart = Number.isNaN(base.getTime()) ? now : base;
  const minimumNoticeMs = Math.max(0, Math.floor((params.minimumNoticeMinutes ?? 0) * 60_000));
  const earliestAllowedStart = new Date(now.getTime() + minimumNoticeMs);
  const safeStart = rangeStart < earliestAllowedStart ? earliestAllowedStart : rangeStart;
  const alignedStart = alignToNextHalfHour(safeStart);
  const rangeEnd = new Date(alignedStart.getTime() + params.days * 24 * 60 * 60_000);

  const durationMs = params.durationMinutes * 60_000;
  const slots: Slot[] = [];

  function hasCoverage(start: Date, end: Date) {
    for (const b of params.coverageBlocks) {
      if (b.startAt <= start && b.endAt >= end) return true;
    }
    return false;
  }

  function hasConflict(start: Date, end: Date) {
    for (const b of params.existing) {
      if (overlaps(start, end, b.startAt, b.endAt)) return true;
    }
    return false;
  }

  for (
    let cur = new Date(alignedStart);
    cur.getTime() + durationMs <= rangeEnd.getTime();
    cur = new Date(cur.getTime() + 30 * 60_000)
  ) {
    const end = new Date(cur.getTime() + durationMs);
    if (!hasCoverage(cur, end)) continue;
    if (hasConflict(cur, end)) continue;

    slots.push({ startAt: cur.toISOString(), endAt: end.toISOString() });
    if (slots.length >= params.limit) break;
  }

  return slots;
}
