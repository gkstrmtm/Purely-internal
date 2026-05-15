import crypto from "node:crypto";

import type { CreditsState } from "@/lib/credits";
import { consumeCredits, getCreditsState } from "@/lib/credits";
import { prisma } from "@/lib/db";

export type FunnelBuilderGuardrailRouteKey =
  | "funnel-create"
  | "funnel-page-create"
  | "generate-html"
  | "custom-code-generate"
  | "visual-review"
  | "read-aloud";

type RateHit = {
  atMs: number;
  routeKey: FunnelBuilderGuardrailRouteKey;
  requestId: string;
};

type GuardrailEventOutcome = "blocked" | "charged" | "error";

type GuardrailEvent = {
  atMs: number;
  atIso: string;
  routeKey: FunnelBuilderGuardrailRouteKey;
  requestId: string;
  outcome: GuardrailEventOutcome;
  creditsCharged: number;
  stepLabel?: string;
  reason?: string;
};

type GuardrailAlertKind = "burst-retry" | "rate-limit" | "repeated-402" | "spend-spike";

type GuardrailAlert = {
  id: string;
  atMs: number;
  atIso: string;
  kind: GuardrailAlertKind;
  routeKey?: FunnelBuilderGuardrailRouteKey;
  requestId?: string;
  summary: string;
};

type GuardrailState = {
  rateHits: RateHit[];
  events: GuardrailEvent[];
  alerts: GuardrailAlert[];
};

type RouteRateLimitProfile = {
  windowMs: number;
  maxRequests: number;
};

type PersistedGuardrailResult<T> = {
  state: GuardrailState;
  result: T;
};

const SERVICE_SLUG = "__funnel_builder_guardrails";

const ROUTE_RATE_LIMITS: Record<FunnelBuilderGuardrailRouteKey, RouteRateLimitProfile> = {
  "funnel-create": { windowMs: 5 * 60 * 1000, maxRequests: 8 },
  "funnel-page-create": { windowMs: 5 * 60 * 1000, maxRequests: 16 },
  "generate-html": { windowMs: 5 * 60 * 1000, maxRequests: 24 },
  "custom-code-generate": { windowMs: 5 * 60 * 1000, maxRequests: 24 },
  "visual-review": { windowMs: 5 * 60 * 1000, maxRequests: 18 },
  "read-aloud": { windowMs: 5 * 60 * 1000, maxRequests: 24 },
};

const AI_SPEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const SPEND_SPIKE_WINDOW_MS = 15 * 60 * 1000;
const REPEATED_402_WINDOW_MS = 15 * 60 * 1000;
const BURST_RETRY_WINDOW_MS = 10 * 60 * 1000;
const MAX_RATE_HITS = 300;
const MAX_EVENTS = 500;
const MAX_ALERTS = 120;
const MAX_WINDOW_MS = Math.max(
  AI_SPEND_WINDOW_MS,
  SPEND_SPIKE_WINDOW_MS,
  REPEATED_402_WINDOW_MS,
  BURST_RETRY_WINDOW_MS,
  ...Object.values(ROUTE_RATE_LIMITS).map((profile) => profile.windowMs),
);

const DEFAULT_AI_ROLLING_CREDIT_LIMIT = readEnvInt("FUNNEL_BUILDER_AI_ROLLING_CREDIT_LIMIT", 120);
const DEFAULT_SPEND_SPIKE_ALERT_CREDITS = readEnvInt("FUNNEL_BUILDER_AI_SPEND_SPIKE_ALERT_CREDITS", 30);
const DEFAULT_REPEATED_402_ALERT_COUNT = readEnvInt("FUNNEL_BUILDER_AI_REPEATED_402_ALERT_COUNT", 3);
const DEFAULT_BURST_RETRY_ALERT_COUNT = readEnvInt("FUNNEL_BUILDER_AI_BURST_RETRY_ALERT_COUNT", 4);

function readEnvInt(name: string, fallback: number) {
  const raw = process.env[name];
  const value = typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function advisoryLockKey(ownerId: string): bigint {
  const digest = crypto.createHash("sha256").update(ownerId).digest();
  digest[0] &= 0x7f;
  return BigInt(`0x${digest.subarray(0, 8).toString("hex")}`);
}

function normalizeRequestId(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 160);
}

function normalizeRouteKey(raw: unknown): FunnelBuilderGuardrailRouteKey | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (
    value === "funnel-create" ||
    value === "funnel-page-create" ||
    value === "generate-html" ||
    value === "custom-code-generate" ||
    value === "visual-review" ||
    value === "read-aloud"
  ) {
    return value;
  }
  return null;
}

function normalizeEventOutcome(raw: unknown): GuardrailEventOutcome | null {
  if (raw === "blocked" || raw === "charged" || raw === "error") return raw;
  return null;
}

function normalizeAlertKind(raw: unknown): GuardrailAlertKind | null {
  if (raw === "burst-retry" || raw === "rate-limit" || raw === "repeated-402" || raw === "spend-spike") return raw;
  return null;
}

function parseGuardrailState(value: unknown): GuardrailState {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

  const rateHits: RateHit[] = [];
  if (Array.isArray(record?.rateHits)) {
    for (const item of record.rateHits) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const entry = item as Record<string, unknown>;
      const routeKey = normalizeRouteKey(entry.routeKey);
      const requestId = normalizeRequestId(entry.requestId);
      const atMs = typeof entry.atMs === "number" ? Math.floor(entry.atMs) : Number.NaN;
      if (!routeKey || !requestId || !Number.isFinite(atMs) || atMs <= 0) continue;
      rateHits.push({ atMs, routeKey, requestId });
      if (rateHits.length >= MAX_RATE_HITS) break;
    }
  }

  const events: GuardrailEvent[] = [];
  if (Array.isArray(record?.events)) {
    for (const item of record.events) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const entry = item as Record<string, unknown>;
      const routeKey = normalizeRouteKey(entry.routeKey);
      const requestId = normalizeRequestId(entry.requestId);
      const outcome = normalizeEventOutcome(entry.outcome);
      const atMs = typeof entry.atMs === "number" ? Math.floor(entry.atMs) : Number.NaN;
      const creditsCharged = typeof entry.creditsCharged === "number" ? Math.max(0, Math.floor(entry.creditsCharged)) : 0;
      if (!routeKey || !requestId || !outcome || !Number.isFinite(atMs) || atMs <= 0) continue;
      events.push({
        atMs,
        atIso: typeof entry.atIso === "string" && entry.atIso.trim() ? entry.atIso.trim().slice(0, 40) : new Date(atMs).toISOString(),
        routeKey,
        requestId,
        outcome,
        creditsCharged,
        ...(typeof entry.stepLabel === "string" && entry.stepLabel.trim() ? { stepLabel: entry.stepLabel.trim().slice(0, 120) } : {}),
        ...(typeof entry.reason === "string" && entry.reason.trim() ? { reason: entry.reason.trim().slice(0, 200) } : {}),
      });
      if (events.length >= MAX_EVENTS) break;
    }
  }

  const alerts: GuardrailAlert[] = [];
  if (Array.isArray(record?.alerts)) {
    for (const item of record.alerts) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const entry = item as Record<string, unknown>;
      const kind = normalizeAlertKind(entry.kind);
      const routeKey = entry.routeKey == null ? undefined : normalizeRouteKey(entry.routeKey) ?? undefined;
      const requestId = normalizeRequestId(entry.requestId);
      const atMs = typeof entry.atMs === "number" ? Math.floor(entry.atMs) : Number.NaN;
      const summary = typeof entry.summary === "string" ? entry.summary.trim().slice(0, 220) : "";
      if (!kind || !summary || !Number.isFinite(atMs) || atMs <= 0) continue;
      alerts.push({
        id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 80) : crypto.randomUUID(),
        atMs,
        atIso: typeof entry.atIso === "string" && entry.atIso.trim() ? entry.atIso.trim().slice(0, 40) : new Date(atMs).toISOString(),
        kind,
        ...(routeKey ? { routeKey } : {}),
        ...(requestId ? { requestId } : {}),
        summary,
      });
      if (alerts.length >= MAX_ALERTS) break;
    }
  }

  return { rateHits, events, alerts };
}

function pruneGuardrailState(state: GuardrailState, nowMs: number): GuardrailState {
  return {
    rateHits: state.rateHits.filter((hit) => nowMs - hit.atMs <= MAX_WINDOW_MS).slice(-MAX_RATE_HITS),
    events: state.events.filter((event) => nowMs - event.atMs <= MAX_WINDOW_MS).slice(-MAX_EVENTS),
    alerts: state.alerts.filter((alert) => nowMs - alert.atMs <= MAX_WINDOW_MS).slice(-MAX_ALERTS),
  };
}

function appendGuardrailAlert(
  state: GuardrailState,
  alert: Omit<GuardrailAlert, "id" | "atIso"> & { atIso?: string },
  dedupeWindowMs = 5 * 60 * 1000,
) {
  const duplicate = state.alerts.find(
    (existing) =>
      existing.kind === alert.kind &&
      existing.summary === alert.summary &&
      existing.routeKey === alert.routeKey &&
      existing.requestId === alert.requestId &&
      Math.abs(existing.atMs - alert.atMs) <= dedupeWindowMs,
  );
  if (duplicate) return;

  state.alerts.push({
    id: crypto.randomUUID(),
    atMs: alert.atMs,
    atIso: alert.atIso ?? new Date(alert.atMs).toISOString(),
    kind: alert.kind,
    ...(alert.routeKey ? { routeKey: alert.routeKey } : {}),
    ...(alert.requestId ? { requestId: alert.requestId } : {}),
    summary: alert.summary,
  });

  if (state.alerts.length > MAX_ALERTS) {
    state.alerts.splice(0, state.alerts.length - MAX_ALERTS);
  }
}

function appendGuardrailEvent(state: GuardrailState, event: GuardrailEvent) {
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }

  if (event.outcome === "blocked" && event.reason === "insufficient_credits") {
    const recent402Count = state.events.filter(
      (item) => item.outcome === "blocked" && item.reason === "insufficient_credits" && event.atMs - item.atMs <= REPEATED_402_WINDOW_MS,
    ).length;
    if (recent402Count >= DEFAULT_REPEATED_402_ALERT_COUNT) {
      appendGuardrailAlert(state, {
        atMs: event.atMs,
        kind: "repeated-402",
        routeKey: event.routeKey,
        requestId: event.requestId,
        summary: `Repeated insufficient-credit blocks detected on ${event.routeKey}.`,
      });
    }
  }

  if (event.outcome === "charged") {
    const recentCredits = state.events
      .filter((item) => item.outcome === "charged" && event.atMs - item.atMs <= SPEND_SPIKE_WINDOW_MS)
      .reduce((sum, item) => sum + item.creditsCharged, 0);
    if (recentCredits >= DEFAULT_SPEND_SPIKE_ALERT_CREDITS) {
      appendGuardrailAlert(state, {
        atMs: event.atMs,
        kind: "spend-spike",
        routeKey: event.routeKey,
        requestId: event.requestId,
        summary: `Builder AI spend spiked to ${recentCredits} credits in the last 15 minutes.`,
      });
    }
  }
}

async function withGuardrailState<T>(
  ownerId: string,
  mutate: (state: GuardrailState, nowMs: number) => PersistedGuardrailResult<T> | Promise<PersistedGuardrailResult<T>>,
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryLockKey(ownerId)})`;

    const row = await tx.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const baseRecord = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : {};
    const nowMs = Date.now();
    const state = pruneGuardrailState(parseGuardrailState(row?.dataJson), nowMs);
    const mutated = await mutate(state, nowMs);

    await tx.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: {
        ownerId,
        serviceSlug: SERVICE_SLUG,
        status: "COMPLETE",
        dataJson: {
          ...baseRecord,
          rateHits: mutated.state.rateHits,
          events: mutated.state.events,
          alerts: mutated.state.alerts,
        },
      },
      update: {
        dataJson: {
          ...baseRecord,
          rateHits: mutated.state.rateHits,
          events: mutated.state.events,
          alerts: mutated.state.alerts,
        },
      },
      select: { id: true },
    });

    return mutated.result;
  });
}

export function readFunnelBuilderRequestId(req?: Request, candidate?: unknown) {
  const candidateId = normalizeRequestId(candidate);
  if (candidateId) return candidateId;
  const headerId = req?.headers.get("x-request-id")?.trim().slice(0, 160) || "";
  if (headerId) return headerId;
  return crypto.randomUUID();
}

export async function enforceFunnelBuilderRouteRateLimit(opts: {
  ownerId: string;
  routeKey: FunnelBuilderGuardrailRouteKey;
  requestId: string;
}): Promise<{ ok: true } | { ok: false; status: 429; error: string }> {
  const profile = ROUTE_RATE_LIMITS[opts.routeKey];

  return await withGuardrailState<{ ok: true } | { ok: false; status: 429; error: string }>(opts.ownerId, (state, nowMs) => {
    const recentRouteHits = state.rateHits.filter(
      (hit) => hit.routeKey === opts.routeKey && nowMs - hit.atMs <= profile.windowMs,
    );
    const repeatedRequestHits = state.rateHits.filter(
      (hit) => hit.requestId === opts.requestId && hit.routeKey === opts.routeKey && nowMs - hit.atMs <= BURST_RETRY_WINDOW_MS,
    );

    if (repeatedRequestHits.length + 1 >= DEFAULT_BURST_RETRY_ALERT_COUNT) {
      appendGuardrailAlert(state, {
        atMs: nowMs,
        kind: "burst-retry",
        routeKey: opts.routeKey,
        requestId: opts.requestId,
        summary: `Burst retries detected on ${opts.routeKey} for request ${opts.requestId}.`,
      });
    }

    if (recentRouteHits.length >= profile.maxRequests) {
      appendGuardrailEvent(state, {
        atMs: nowMs,
        atIso: new Date(nowMs).toISOString(),
        routeKey: opts.routeKey,
        requestId: opts.requestId,
        outcome: "blocked",
        creditsCharged: 0,
        reason: "rate_limit_exceeded",
      });
      appendGuardrailAlert(state, {
        atMs: nowMs,
        kind: "rate-limit",
        routeKey: opts.routeKey,
        requestId: opts.requestId,
        summary: `Route rate limit hit on ${opts.routeKey}.`,
      });
      return {
        state,
        result: {
          ok: false as const,
          status: 429 as const,
          error: "Too many builder requests were sent in a short window. Wait a minute and try again.",
        },
      };
    }

    state.rateHits.push({ atMs: nowMs, routeKey: opts.routeKey, requestId: opts.requestId });
    if (state.rateHits.length > MAX_RATE_HITS) {
      state.rateHits.splice(0, state.rateHits.length - MAX_RATE_HITS);
    }

    return { state, result: { ok: true as const } };
  });
}

export async function consumeFunnelBuilderAiCredits(opts: {
  ownerId: string;
  routeKey: Extract<FunnelBuilderGuardrailRouteKey, "generate-html" | "custom-code-generate" | "visual-review" | "read-aloud">;
  requestId: string;
  amount: number;
  stepLabel?: string;
}): Promise<
  | { ok: true; state: CreditsState }
  | { ok: false; state: CreditsState; status: 402 | 429; error: string }
> {
  const amount = Math.max(0, Math.floor(opts.amount));
  if (amount <= 0) return { ok: true, state: await getCreditsState(opts.ownerId) };

  const spendGate = await withGuardrailState<{ ok: true } | { ok: false }>(opts.ownerId, (state, nowMs) => {
    const rollingCredits = state.events
      .filter((event) => event.outcome === "charged" && nowMs - event.atMs <= AI_SPEND_WINDOW_MS)
      .reduce((sum, event) => sum + event.creditsCharged, 0);

    if (rollingCredits + amount > DEFAULT_AI_ROLLING_CREDIT_LIMIT) {
      appendGuardrailEvent(state, {
        atMs: nowMs,
        atIso: new Date(nowMs).toISOString(),
        routeKey: opts.routeKey,
        requestId: opts.requestId,
        outcome: "blocked",
        creditsCharged: 0,
        ...(opts.stepLabel ? { stepLabel: opts.stepLabel } : {}),
        reason: "rolling_spend_limit_exceeded",
      });
      appendGuardrailAlert(state, {
        atMs: nowMs,
        kind: "spend-spike",
        routeKey: opts.routeKey,
        requestId: opts.requestId,
        summary: `Rolling builder AI limit blocked ${opts.routeKey} after ${rollingCredits} credits in the last 24 hours.`,
      });
      return { state, result: { ok: false as const } };
    }

    return { state, result: { ok: true as const } };
  });

  if (!spendGate.ok) {
    return {
      ok: false,
      state: await getCreditsState(opts.ownerId),
      status: 429,
      error: "This account hit its current builder AI safety limit. Wait for the window to cool down before retrying.",
    };
  }

  const charged = await consumeCredits(opts.ownerId, amount);
  if (!charged.ok) {
    await withGuardrailState(opts.ownerId, (state, nowMs) => {
      appendGuardrailEvent(state, {
        atMs: nowMs,
        atIso: new Date(nowMs).toISOString(),
        routeKey: opts.routeKey,
        requestId: opts.requestId,
        outcome: "blocked",
        creditsCharged: 0,
        ...(opts.stepLabel ? { stepLabel: opts.stepLabel } : {}),
        reason: "insufficient_credits",
      });
      return { state, result: null };
    });
    return { ok: false, state: charged.state, status: 402, error: "You need more credits to continue this builder action." };
  }

  await withGuardrailState(opts.ownerId, (state, nowMs) => {
    appendGuardrailEvent(state, {
      atMs: nowMs,
      atIso: new Date(nowMs).toISOString(),
      routeKey: opts.routeKey,
      requestId: opts.requestId,
      outcome: "charged",
      creditsCharged: amount,
      ...(opts.stepLabel ? { stepLabel: opts.stepLabel } : {}),
    });
    return { state, result: null };
  });

  return { ok: true, state: charged.state };
}

export async function recordFunnelBuilderAiFailure(opts: {
  ownerId: string;
  routeKey: Extract<FunnelBuilderGuardrailRouteKey, "generate-html" | "custom-code-generate" | "visual-review" | "read-aloud">;
  requestId: string;
  stepLabel?: string;
  reason: string;
}) {
  await withGuardrailState(opts.ownerId, (state, nowMs) => {
    appendGuardrailEvent(state, {
      atMs: nowMs,
      atIso: new Date(nowMs).toISOString(),
      routeKey: opts.routeKey,
      requestId: opts.requestId,
      outcome: "error",
      creditsCharged: 0,
      ...(opts.stepLabel ? { stepLabel: opts.stepLabel } : {}),
      reason: opts.reason.trim().slice(0, 200),
    });
    return { state, result: null };
  });
}