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
const MAX_RECENT_ACTIVITY = 500;

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

function readActivityList(value: unknown): Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r: any = raw as any;
    const atMs = Number.isFinite(Number(r.atMs)) ? Math.max(0, Math.floor(Number(r.atMs))) : 0;
    const dtSec = Number.isFinite(Number(r.dtSec)) ? Math.max(1, Math.min(60, Math.floor(Number(r.dtSec)))) : 0;
    const path = typeof r.path === "string" ? r.path.trim().slice(0, 512) : "";
    const pageKey = typeof r.pageKey === "string" ? r.pageKey.trim().slice(0, 140) : "";
    if (!atMs || !dtSec || !path) continue;
    out.push(pageKey ? { atMs, dtSec, path, pageKey } : { atMs, dtSec, path });
  }
  // Keep newest-first, drop malformed ordering.
  out.sort((a, b) => b.atMs - a.atMs);
  return out.slice(0, MAX_RECENT_ACTIVITY);
}

function stripQueryHash(pathRaw: string): string {
  const s = String(pathRaw || "").trim();
  if (!s) return "";
  const q = s.indexOf("?");
  const h = s.indexOf("#");
  const cut = q === -1 ? h : h === -1 ? q : Math.min(q, h);
  return (cut === -1 ? s : s.slice(0, cut)).trim();
}

function derivePageKeyFromPath(pathRaw: unknown): string | null {
  const raw = typeof pathRaw === "string" ? stripQueryHash(pathRaw) : "";
  const path = raw.trim();
  if (!path || !path.startsWith("/")) return null;

  const lower = path.toLowerCase();
  const variants = ["/portal/app", "/credit/app"] as const;
  for (const base of variants) {
    if (lower === base || lower === `${base}/`) return `${base}/dashboard`;
    if (lower.startsWith(`${base}/services/`)) {
      const rest = path.slice(`${base}/services/`.length);
      const slug = rest.split("/")[0]?.trim() || "";
      return slug ? `${base}/services/${slug.slice(0, 80)}` : null;
    }
    if (lower.startsWith(`${base}/`)) {
      const rest = path.slice(`${base}/`.length);
      const section = rest.split("/")[0]?.trim() || "";
      return section ? `${base}/${section.slice(0, 80)}` : `${base}/dashboard`;
    }
  }
  return null;
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
  const path = typeof parsed.data.path === "string" ? stripQueryHash(parsed.data.path).trim().slice(0, 512) : "";
  const serviceKey = deriveServiceKeyFromPath(path);
  const pageKey = derivePageKeyFromPath(path);

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

    const prevPathTimeSec = readRecordNumberMap(prev.pathTimeSec);
    const nextPathTimeSec = { ...prevPathTimeSec };
    if (pageKey) {
      nextPathTimeSec[pageKey] = Math.max(0, (nextPathTimeSec[pageKey] ?? 0) + dtSec);
    }

    const prevActivity = readActivityList(prev.recentActivity);
    const nextActivity = [
      { atMs: nowMs, path, ...(pageKey ? { pageKey } : {}), dtSec },
      ...prevActivity,
    ].slice(0, MAX_RECENT_ACTIVITY);

    const next = {
      ...prev,
      version: 3,
      lastSeenAtMs: nowMs,
      ...(path ? { lastSeenPath: path } : {}),
      ...(pageKey ? { lastSeenPageKey: pageKey } : {}),
      ...(serviceKey ? { lastSeenService: serviceKey } : {}),
      ...(Object.keys(nextServiceTimeSec).length ? { serviceTimeSec: topKeysByValue(nextServiceTimeSec, 40) } : {}),
      ...(Object.keys(nextPathTimeSec).length ? { pathTimeSec: topKeysByValue(nextPathTimeSec, 80) } : {}),
      ...(nextActivity.length ? { recentActivity: nextActivity } : {}),
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
  // Avoid an interactive transaction here because this endpoint is hit frequently
  // from the shell and can time out locally while other long queries are in flight.
  try {
    const event = await prisma.portalHoursSavedEvent.upsert({
      where: { ownerId_kind_sourceId: { ownerId, kind: KIND, sourceId: dayKey } },
      create: {
        ownerId,
        kind: KIND,
        sourceId: dayKey,
        secondsSaved: Math.min(MAX_SECONDS_PER_DAY, dtSec),
        occurredAt,
      },
      update: {
        secondsSaved: { increment: dtSec },
        occurredAt,
      },
      select: { id: true, secondsSaved: true },
    });

    if (event.secondsSaved > MAX_SECONDS_PER_DAY) {
      await prisma.portalHoursSavedEvent.update({
        where: { id: event.id },
        data: { secondsSaved: MAX_SECONDS_PER_DAY, occurredAt },
        select: { id: true },
      });
    }
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }

  return NextResponse.json({ ok: true });
}
