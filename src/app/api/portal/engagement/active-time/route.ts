import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    dtSec: z.number().int().min(1).max(60),
    path: z.string().max(512).optional(),
  })
  .strict();

const KIND = "portal_active_time";
const MAX_SECONDS_PER_DAY = 8 * 60 * 60; // 8h/day cap
const ENGAGEMENT_SERVICE_SLUG = "portal_engagement";

function dayKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const dtSec = Math.max(1, Math.min(60, parsed.data.dtSec));

  // Best-effort: bump "last seen" for any portal activity ping.
  // Keep it migration-free by storing it in PortalServiceSetup JSON.
  try {
    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: ENGAGEMENT_SERVICE_SLUG } },
      create: { ownerId, serviceSlug: ENGAGEMENT_SERVICE_SLUG, status: "COMPLETE", dataJson: { version: 1, lastSeenAtMs: Date.now() } },
      update: { status: "COMPLETE", dataJson: { version: 1, lastSeenAtMs: Date.now() } },
      select: { id: true },
    });
  } catch {
    // ignore transient DB errors
  }

  const now = new Date();
  const dayKey = dayKeyUtc(now);
  const occurredAt = new Date(`${dayKey}T00:00:00.000Z`);

  // Aggregate into a single row per owner per day.
  // This keeps weekly rollups correct (occurredAt stays pinned to day start).
  await prisma.$transaction(async (tx) => {
    const existing = await tx.portalHoursSavedEvent.findUnique({
      where: { ownerId_kind_sourceId: { ownerId, kind: KIND, sourceId: dayKey } },
      select: { id: true, secondsSaved: true },
    });

    if (!existing) {
      await tx.portalHoursSavedEvent.create({
        data: {
          ownerId,
          kind: KIND,
          sourceId: dayKey,
          secondsSaved: Math.min(MAX_SECONDS_PER_DAY, dtSec),
          occurredAt,
        },
        select: { id: true },
      });
      return;
    }

    const nextTotal = Math.min(MAX_SECONDS_PER_DAY, Math.max(0, existing.secondsSaved) + dtSec);
    await tx.portalHoursSavedEvent.update({
      where: { id: existing.id },
      data: { secondsSaved: nextTotal, occurredAt },
      select: { id: true },
    });
  });

  return NextResponse.json({ ok: true });
}
