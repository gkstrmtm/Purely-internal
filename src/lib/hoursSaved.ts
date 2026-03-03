import { prisma } from "@/lib/db";

export type HoursSavedKind =
  | "ai_receptionist_call"
  | "missed_call_textback"
  | "portal_active_time";

export async function upsertHoursSavedEvent(opts: {
  ownerId: string;
  kind: HoursSavedKind;
  sourceId: string;
  secondsSaved: number;
  occurredAt?: Date | null;
}): Promise<void> {
  const ownerId = String(opts.ownerId || "").trim();
  const kind = String(opts.kind || "").trim() as HoursSavedKind;
  const sourceId = String(opts.sourceId || "").trim();

  if (!ownerId || !kind || !sourceId) return;

  const seconds = Number.isFinite(opts.secondsSaved) ? Math.max(0, Math.floor(opts.secondsSaved)) : 0;
  if (seconds <= 0) return;

  const occurredAt = opts.occurredAt instanceof Date && Number.isFinite(opts.occurredAt.getTime()) ? opts.occurredAt : new Date();

  await prisma.portalHoursSavedEvent.upsert({
    where: {
      ownerId_kind_sourceId: {
        ownerId,
        kind,
        sourceId,
      },
    },
    create: {
      ownerId,
      kind,
      sourceId,
      secondsSaved: seconds,
      occurredAt,
    },
    update: {
      secondsSaved: seconds,
      occurredAt,
    },
    select: { id: true },
  });
}

export async function sumHoursSavedSeconds(opts: {
  ownerId: string;
  since?: Date | null;
}): Promise<number> {
  const ownerId = String(opts.ownerId || "").trim();
  if (!ownerId) return 0;

  const since = opts.since instanceof Date && Number.isFinite(opts.since.getTime()) ? opts.since : null;

  const agg = await prisma.portalHoursSavedEvent.aggregate({
    where: {
      ownerId,
      ...(since ? { occurredAt: { gte: since } } : {}),
    },
    _sum: { secondsSaved: true },
  });

  const n = Number(agg?._sum?.secondsSaved ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
