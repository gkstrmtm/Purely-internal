import { prisma } from "@/lib/db";
import { getBookingCalendarsConfig, setBookingCalendarsConfig } from "@/lib/bookingCalendars";

type RangeArgs = {
  userId: string;
  rangeStart: Date;
  rangeEnd: Date;
  calendarId?: string | null;
};

type CoverageArgs = {
  userId: string;
  startAt: Date;
  endAt: Date;
  calendarId?: string | null;
};

type AvailabilityBlockRow = {
  id?: string;
  startAt: Date;
  endAt: Date;
};

function normalizeStoredBlocks(blocks: Array<{ startAt: string; endAt: string }> | undefined): AvailabilityBlockRow[] {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block) => ({ startAt: new Date(block.startAt), endAt: new Date(block.endAt) }))
    .filter((block) => !Number.isNaN(block.startAt.getTime()) && !Number.isNaN(block.endAt.getTime()) && block.endAt > block.startAt);
}

export async function listAvailabilityBlocksForRange({ userId, rangeStart, rangeEnd, calendarId }: RangeArgs): Promise<AvailabilityBlockRow[]> {
  const trimmedCalendarId = typeof calendarId === "string" ? calendarId.trim() : "";
  if (trimmedCalendarId) {
    const calendars = await getBookingCalendarsConfig(userId).catch(() => null);
    const calendar = calendars?.calendars.find((entry) => entry.id === trimmedCalendarId);
    const storedBlocks = normalizeStoredBlocks(calendar?.availabilityBlocks);
    if (storedBlocks.length > 0) {
      return storedBlocks.filter((block) => block.startAt < rangeEnd && block.endAt > rangeStart);
    }
  }

  return prisma.availabilityBlock.findMany({
    where: {
      userId,
      startAt: { lt: rangeEnd },
      endAt: { gt: rangeStart },
    },
    orderBy: { startAt: "asc" },
    select: { id: true, startAt: true, endAt: true },
  });
}

export async function findAvailabilityCoverage({ userId, startAt, endAt, calendarId }: CoverageArgs) {
  const trimmedCalendarId = typeof calendarId === "string" ? calendarId.trim() : "";
  if (trimmedCalendarId) {
    const calendars = await getBookingCalendarsConfig(userId).catch(() => null);
    const calendar = calendars?.calendars.find((entry) => entry.id === trimmedCalendarId);
    const storedBlocks = normalizeStoredBlocks(calendar?.availabilityBlocks);
    if (storedBlocks.length > 0) {
      const found = storedBlocks.find((block) => block.startAt <= startAt && block.endAt >= endAt);
      return found ? { id: `${trimmedCalendarId}:${found.startAt.toISOString()}` } : null;
    }
  }

  return prisma.availabilityBlock.findFirst({
    where: {
      userId,
      startAt: { lte: startAt },
      endAt: { gte: endAt },
    },
    select: { id: true },
  });
}

export async function replaceCalendarAvailabilityRange(args: {
  userId: string;
  calendarId: string;
  rangeStart: Date;
  rangeEnd: Date;
  blocks: Array<{ startAt: Date; endAt: Date }>;
}) {
  const calendarId = args.calendarId.trim();
  const current = await getBookingCalendarsConfig(args.userId);
  const calendars = current.calendars.map((calendar) => {
    if (calendar.id !== calendarId) return calendar;

    const existing = normalizeStoredBlocks(calendar.availabilityBlocks).filter(
      (block) => !(block.startAt < args.rangeEnd && block.endAt > args.rangeStart),
    );
    const nextBlocks = [...existing, ...args.blocks]
      .sort((left, right) => left.startAt.getTime() - right.startAt.getTime())
      .map((block) => ({ startAt: block.startAt.toISOString(), endAt: block.endAt.toISOString() }));

    return {
      ...calendar,
      availabilityBlocks: nextBlocks,
    };
  });

  await setBookingCalendarsConfig(args.userId, { version: 1, calendars });
}
