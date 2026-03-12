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

function readObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readRecordNumberMap(value: unknown): Record<string, number> {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!rec) return {};
  const out: Record<string, number> = {};
  for (const [kRaw, vRaw] of Object.entries(rec)) {
    const k = String(kRaw || "").trim();
    if (!k) continue;
    const n = typeof vRaw === "number" ? vRaw : typeof vRaw === "string" ? Number(vRaw) : NaN;
    if (!Number.isFinite(n)) continue;
    out[k] = Math.max(0, Math.floor(n));
  }
  return out;
}

function topKeysByValue(map: Record<string, number>, keep: number): Record<string, number> {
  const entries = Object.entries(map)
    .filter(([k, v]) => Boolean(k) && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1]);
  const next: Record<string, number> = {};
  for (const [k, v] of entries.slice(0, keep)) next[k] = v;
  return next;
}

function deriveServiceKeyFromPath(pathRaw: unknown): string | null {
  const path = typeof pathRaw === "string" ? pathRaw.trim() : "";
  if (!path || !path.startsWith("/")) return null;

  // Normalize to a stable portal-relative shape.
  const lower = path.toLowerCase();

  const variants = ["/portal/app", "/credit/app"] as const;
  for (const base of variants) {
    if (lower === base || lower === `${base}/`) return "dashboard";
    if (lower.startsWith(`${base}/services/`)) {
      const rest = path.slice(`${base}/services/`.length);
      const slug = rest.split("/")[0]?.trim() || "";
      return slug ? slug.slice(0, 80) : null;
    }
    if (lower.startsWith(`${base}/`)) {
      const rest = path.slice(`${base}/`.length);
      const section = rest.split("/")[0]?.trim() || "";
      return section ? section.slice(0, 80) : null;
    }
  }

  return null;
}

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
  const path = typeof parsed.data.path === "string" ? parsed.data.path.trim().slice(0, 512) : "";
  const serviceKey = deriveServiceKeyFromPath(path);

  // Best-effort: bump "last seen" for any portal activity ping.
  // Keep it migration-free by storing it in PortalServiceSetup JSON.
  try {
    const nowMs = Date.now();
    const existing = await prisma.portalServiceSetup
      .findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: ENGAGEMENT_SERVICE_SLUG } },
        select: { dataJson: true },
      })
      .catch(() => null);

    const prev = readObj(existing?.dataJson);
    const prevServiceTimeSec = readRecordNumberMap(prev.serviceTimeSec);
    const nextServiceTimeSec = { ...prevServiceTimeSec };
    if (serviceKey) {
      nextServiceTimeSec[serviceKey] = Math.max(0, (nextServiceTimeSec[serviceKey] ?? 0) + dtSec);
    }

    const next = {
      ...prev,
      version: 2,
      lastSeenAtMs: nowMs,
      ...(path ? { lastSeenPath: path } : {}),
      ...(serviceKey ? { lastSeenService: serviceKey } : {}),
      ...(Object.keys(nextServiceTimeSec).length ? { serviceTimeSec: topKeysByValue(nextServiceTimeSec, 40) } : {}),
    };

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: ENGAGEMENT_SERVICE_SLUG } },
      create: { ownerId, serviceSlug: ENGAGEMENT_SERVICE_SLUG, status: "COMPLETE", dataJson: next },
      update: { status: "COMPLETE", dataJson: next },
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
