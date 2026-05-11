import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "portal_diagnostics";
const MAX_EVENTS = 200;
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

const bodySchema = z
  .object({
    kind: z.enum(["runtime_error", "unhandled_rejection", "resource_error", "action_failure"]),
    message: z.string().trim().min(1).max(4000),
    path: z.string().trim().max(512).optional(),
    source: z.string().trim().max(64).optional(),
    stack: z.string().trim().max(8000).optional(),
    file: z.string().trim().max(2000).optional(),
    line: z.number().int().min(0).max(10_000_000).optional(),
    column: z.number().int().min(0).max(10_000_000).optional(),
    meta: z.unknown().optional(),
  })
  .strict();

type StoredPortalDiagnosticEvent = {
  id: string;
  kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure";
  createdAtIso: string;
  lastSeenAtIso: string;
  count: number;
  message: string;
  path?: string;
  source?: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  meta?: Record<string, unknown>;
};

type StoredPayload = {
  version: 1;
  events: StoredPortalDiagnosticEvent[];
};

type StoredBugReport = {
  createdAtIso: string;
};

type DiagnosticsBucket = {
  key: string;
  label: string;
  count: number;
};

function nowIso() {
  return new Date().toISOString();
}

function parseMeta(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [keyRaw, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(keyRaw || "").trim().slice(0, 80);
    if (!key) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function parsePayload(raw: unknown): StoredPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { version: 1, events: [] };
  const rec = raw as Record<string, unknown>;
  const events = Array.isArray(rec.events)
    ? (rec.events as unknown[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [] as StoredPortalDiagnosticEvent[];
        const item = entry as Record<string, unknown>;
        const id = typeof item.id === "string" ? item.id.trim() : "";
        const kind =
          item.kind === "runtime_error" ||
          item.kind === "unhandled_rejection" ||
          item.kind === "resource_error" ||
          item.kind === "action_failure"
            ? item.kind
            : null;
        const createdAtIso = typeof item.createdAtIso === "string" ? item.createdAtIso.trim() : "";
        const lastSeenAtIso = typeof item.lastSeenAtIso === "string" ? item.lastSeenAtIso.trim() : createdAtIso;
        const message = typeof item.message === "string" ? item.message.trim().slice(0, 4000) : "";
        const count = Number.isFinite(Number(item.count)) ? Math.max(1, Math.floor(Number(item.count))) : 1;
        if (!id || !kind || !createdAtIso || !message) return [] as StoredPortalDiagnosticEvent[];
        const next: StoredPortalDiagnosticEvent = {
          id,
          kind,
          createdAtIso,
          lastSeenAtIso: lastSeenAtIso || createdAtIso,
          count,
          message,
        };
        if (typeof item.path === "string" && item.path.trim()) next.path = item.path.trim().slice(0, 512);
        if (typeof item.source === "string" && item.source.trim()) next.source = item.source.trim().slice(0, 64);
        if (typeof item.stack === "string" && item.stack.trim()) next.stack = item.stack.trim().slice(0, 8000);
        if (typeof item.file === "string" && item.file.trim()) next.file = item.file.trim().slice(0, 2000);
        if (Number.isFinite(Number(item.line))) next.line = Math.max(0, Math.floor(Number(item.line)));
        if (Number.isFinite(Number(item.column))) next.column = Math.max(0, Math.floor(Number(item.column)));
        const meta = parseMeta(item.meta);
        if (meta) next.meta = meta;
        return [next];
      })
    : [];

  return { version: 1, events: events.slice(0, MAX_EVENTS) };
}

function parseBugReports(raw: unknown): StoredBugReport[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.reports)) return [];
  return rec.reports.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [] as StoredBugReport[];
    const item = entry as Record<string, unknown>;
    const createdAtIso = typeof item.createdAtIso === "string" ? item.createdAtIso.trim() : "";
    return createdAtIso ? [{ createdAtIso }] : [];
  });
}

function metaString(meta: Record<string, unknown> | undefined, key: string) {
  if (!meta) return null;
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metaNumber(meta: Record<string, unknown> | undefined, key: string) {
  if (!meta) return null;
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addBucketCount(map: Map<string, number>, key: string | null | undefined, amount: number) {
  const safeKey = String(key || "unknown").trim() || "unknown";
  map.set(safeKey, (map.get(safeKey) ?? 0) + Math.max(1, amount));
}

function environmentLabel(key: string) {
  if (key === "local") return "Local / dev";
  if (key === "preview") return "Preview";
  if (key === "production") return "Production";
  return "Unknown";
}

function surfaceLabel(key: string) {
  if (key === "admin_portal") return "Admin portal";
  if (key === "hosted_funnel") return "Hosted funnel";
  if (key === "public_site") return "Public site";
  return "Unknown";
}

function audienceLabel(key: string) {
  if (key === "internal_operator") return "Internal operator";
  if (key === "customer_surface") return "Customer-facing";
  return "Unknown";
}

function toBuckets(map: Map<string, number>, labelForKey: (key: string) => string, limit = 6): DiagnosticsBucket[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, label: labelForKey(key), count }));
}

function eventSignature(event: Pick<StoredPortalDiagnosticEvent, "kind" | "message" | "path" | "file">) {
  return [event.kind, event.message, event.path || "", event.file || ""].join("::");
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  try {
    const setups = await prisma.portalServiceSetup.findMany({
      where: { ownerId, serviceSlug: { in: [SERVICE_SLUG, "bug-reports"] } },
      select: { serviceSlug: true, dataJson: true },
    });

    const setupMap = new Map(setups.map((item) => [item.serviceSlug, item.dataJson]));
    const diagnostics = parsePayload(setupMap.get(SERVICE_SLUG) ?? null).events;
    const bugReports = parseBugReports(setupMap.get("bug-reports") ?? null);

    const kindCounts = {
      totalOccurrences: 0,
      actionFailures: 0,
      runtimeErrors: 0,
      unhandledRejections: 0,
      resourceErrors: 0,
    };

    const segmentCounts = {
      localOperator: 0,
      previewOperator: 0,
      productionOperator: 0,
      customerFacing: 0,
      unknown: 0,
    };

    const environmentCounts = new Map<string, number>();
    const surfaceCounts = new Map<string, number>();
    const audienceCounts = new Map<string, number>();
    const hostCounts = new Map<string, number>();
    const pathCounts = new Map<string, number>();
    const actionCounts = new Map<string, { area: string; action: string; count: number }>();

    for (const event of diagnostics) {
      kindCounts.totalOccurrences += event.count;
      if (event.kind === "action_failure") kindCounts.actionFailures += event.count;
      if (event.kind === "runtime_error") kindCounts.runtimeErrors += event.count;
      if (event.kind === "unhandled_rejection") kindCounts.unhandledRejections += event.count;
      if (event.kind === "resource_error") kindCounts.resourceErrors += event.count;

      const environment = metaString(event.meta, "viewEnvironment") || "unknown";
      const surface = metaString(event.meta, "viewSurface") || "unknown";
      const audience = metaString(event.meta, "viewAudience") || "unknown";
      const host = metaString(event.meta, "viewHost") || "unknown";

      addBucketCount(environmentCounts, environment, event.count);
      addBucketCount(surfaceCounts, surface, event.count);
      addBucketCount(audienceCounts, audience, event.count);
      addBucketCount(hostCounts, host, event.count);
      if (event.path) addBucketCount(pathCounts, event.path, event.count);

      if (audience === "internal_operator" && environment === "local") segmentCounts.localOperator += event.count;
      else if (audience === "internal_operator" && environment === "preview") segmentCounts.previewOperator += event.count;
      else if (audience === "internal_operator" && environment === "production") segmentCounts.productionOperator += event.count;
      else if (audience === "customer_surface") segmentCounts.customerFacing += event.count;
      else segmentCounts.unknown += event.count;

      if (event.kind === "action_failure") {
        const area = metaString(event.meta, "area") || "unknown";
        const action = metaString(event.meta, "action") || "unknown";
        const key = `${area}::${action}`;
        const prev = actionCounts.get(key);
        if (prev) prev.count += event.count;
        else actionCounts.set(key, { area, action, count: event.count });
      }
    }

    const lastBugReport = bugReports[0]?.createdAtIso ? new Date(bugReports[0].createdAtIso).toISOString() : null;

    return NextResponse.json({
      ok: true,
      counts: kindCounts,
      segments: segmentCounts,
      contexts: {
        environments: toBuckets(environmentCounts, environmentLabel),
        surfaces: toBuckets(surfaceCounts, surfaceLabel),
        audiences: toBuckets(audienceCounts, audienceLabel),
        hosts: toBuckets(hostCounts, (key) => key, 8),
      },
      topPaths: Array.from(pathCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([path, count]) => ({ path, count })),
      topActions: Array.from(actionCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      bugReports: {
        count: bugReports.length,
        lastReportedAt: lastBugReport,
      },
      recentEvents: diagnostics.slice(0, 50).map((event) => ({
        id: event.id,
        kind: event.kind,
        createdAtIso: event.createdAtIso,
        lastSeenAtIso: event.lastSeenAtIso,
        count: event.count,
        message: event.message,
        ...(event.path ? { path: event.path } : {}),
        ...(event.source ? { source: event.source } : {}),
        ...(event.file ? { file: event.file } : {}),
        ...(typeof event.line === "number" ? { line: event.line } : {}),
        ...(typeof event.column === "number" ? { column: event.column } : {}),
        area: metaString(event.meta, "area"),
        action: metaString(event.meta, "action"),
        status: metaNumber(event.meta, "status"),
        viewHost: metaString(event.meta, "viewHost"),
        viewEnvironment: metaString(event.meta, "viewEnvironment") || "unknown",
        viewSurface: metaString(event.meta, "viewSurface") || "unknown",
        viewAudience: metaString(event.meta, "viewAudience") || "unknown",
      })),
    });
  } catch (err) {
    console.error("/api/portal/diagnostics/events: load failed", err);
    return NextResponse.json({ error: "Unable to load diagnostics" }, { status: 500 });
  }
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
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const createdAtIso = nowIso();
  const meta = parseMeta(parsed.data.meta);
  const nextEvent: StoredPortalDiagnosticEvent = {
    id: `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: parsed.data.kind,
    createdAtIso,
    lastSeenAtIso: createdAtIso,
    count: 1,
    message: parsed.data.message,
    ...(parsed.data.path ? { path: parsed.data.path } : {}),
    ...(parsed.data.source ? { source: parsed.data.source } : {}),
    ...(parsed.data.stack ? { stack: parsed.data.stack } : {}),
    ...(parsed.data.file ? { file: parsed.data.file } : {}),
    ...(typeof parsed.data.line === "number" ? { line: parsed.data.line } : {}),
    ...(typeof parsed.data.column === "number" ? { column: parsed.data.column } : {}),
    ...(meta ? { meta } : {}),
  };

  try {
    const existing = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const prev = parsePayload(existing?.dataJson ?? null);
    const first = prev.events[0] ?? null;
    const mergedEvents = [...prev.events];

    if (first) {
      const prevSeenMs = Date.parse(first.lastSeenAtIso || first.createdAtIso);
      const nextSeenMs = Date.parse(createdAtIso);
      if (
        Number.isFinite(prevSeenMs) &&
        Number.isFinite(nextSeenMs) &&
        nextSeenMs - prevSeenMs <= DEDUPE_WINDOW_MS &&
        eventSignature(first) === eventSignature(nextEvent)
      ) {
        mergedEvents[0] = {
          ...first,
          lastSeenAtIso: createdAtIso,
          count: Math.max(1, first.count || 1) + 1,
          stack: nextEvent.stack || first.stack,
          source: nextEvent.source || first.source,
          line: typeof nextEvent.line === "number" ? nextEvent.line : first.line,
          column: typeof nextEvent.column === "number" ? nextEvent.column : first.column,
          meta: nextEvent.meta || first.meta,
        };
      } else {
        mergedEvents.unshift(nextEvent);
      }
    } else {
      mergedEvents.unshift(nextEvent);
    }

    const next: StoredPayload = {
      version: 1,
      events: mergedEvents.slice(0, MAX_EVENTS),
    };

    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next as any },
      update: { status: "COMPLETE", dataJson: next as any },
      select: { id: true },
    });
  } catch (err) {
    console.error("/api/portal/diagnostics/events: persist failed", err);
  }

  return NextResponse.json({ ok: true });
}