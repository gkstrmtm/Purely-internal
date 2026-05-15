export const PORTAL_FEEDBACK_SETUP_SLUG = "bug-reports";
export const MAX_PORTAL_FEEDBACK_ITEMS = 200;

export const FEEDBACK_CATEGORY_VALUES = ["bug", "request", "idea", "confusion", "praise"] as const;
export const FEEDBACK_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;
export const FEEDBACK_TRIAGE_STATUS_VALUES = ["new", "reviewing", "planned", "shipped", "closed"] as const;
export const FEEDBACK_TRIAGE_PRIORITY_VALUES = ["p1", "p2", "p3", "p4"] as const;
export const FEEDBACK_PORTAL_VARIANT_VALUES = ["portal", "credit"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORY_VALUES)[number];
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITY_VALUES)[number];
export type FeedbackTriageStatus = (typeof FEEDBACK_TRIAGE_STATUS_VALUES)[number];
export type FeedbackTriagePriority = (typeof FEEDBACK_TRIAGE_PRIORITY_VALUES)[number];
export type FeedbackPortalVariant = (typeof FEEDBACK_PORTAL_VARIANT_VALUES)[number];

export type StoredPortalFeedbackTriage = {
  status: FeedbackTriageStatus;
  priority: FeedbackTriagePriority;
  backlogRef?: string;
  promptRef?: string;
  exportBucket?: string;
  notes?: string;
  reviewerEmail?: string;
  lastReviewedAtIso?: string;
};

export type StoredPortalFeedbackItem = {
  id: string;
  createdAtIso: string;
  updatedAtIso?: string;
  title: string;
  message: string;
  expected?: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  area?: string;
  path?: string;
  serviceSlug?: string;
  portalVariant?: FeedbackPortalVariant;
  reporterEmail?: string;
  artifactUrl?: string;
  buildSha?: string | null;
  commitRef?: string | null;
  deploymentId?: string | null;
  meta?: Record<string, unknown>;
  triage: StoredPortalFeedbackTriage;
};

export type StoredPortalFeedbackPayload = {
  version: 2;
  items: StoredPortalFeedbackItem[];
};

export type PortalFeedbackTriagePatch = {
  status?: FeedbackTriageStatus;
  priority?: FeedbackTriagePriority;
  backlogRef?: string;
  promptRef?: string;
  exportBucket?: string;
  notes?: string;
  reviewerEmail?: string;
  lastReviewedAtIso?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function readOptionalString(value: unknown, maxLength: number) {
  const next = readString(value, maxLength);
  return next || undefined;
}

function readNullableString(value: unknown, maxLength: number) {
  if (value === null) return null;
  const next = readString(value, maxLength);
  return next || null;
}

function readEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

export function normalizePortalPath(value: unknown) {
  const raw = readString(value, 2000);
  if (!raw) return undefined;

  const trimHash = (input: string) => input.split("#")[0]?.trim() || "";
  try {
    const parsed = new URL(raw);
    const normalized = `${parsed.pathname || "/"}${parsed.search || ""}`.slice(0, 512);
    return trimHash(normalized) || undefined;
  } catch {
    const normalized = trimHash(raw);
    if (!normalized) return undefined;
    return normalized.startsWith("/") ? normalized.slice(0, 512) : normalized.slice(0, 512);
  }
}

export function sanitizePortalFeedbackMeta(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!isPlainObject(value) || depth > 2) return undefined;
  const out: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 20)) {
    const key = readString(rawKey, 80);
    if (!key) continue;
    if (/(token|secret|password|cookie|authorization|auth)/i.test(key)) continue;

    if (
      rawValue === null ||
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      out[key] = typeof rawValue === "string" ? rawValue.slice(0, 500) : rawValue;
      continue;
    }

    if (Array.isArray(rawValue)) {
      out[key] = rawValue
        .slice(0, 10)
        .map((item) => (typeof item === "string" ? item.slice(0, 200) : typeof item === "number" || typeof item === "boolean" ? item : null))
        .filter((item) => item !== null);
      continue;
    }

    const nested = sanitizePortalFeedbackMeta(rawValue, depth + 1);
    if (nested && Object.keys(nested).length) out[key] = nested;
  }

  return Object.keys(out).length ? out : undefined;
}

export function buildPortalFeedbackTitle(messageRaw: string, areaRaw?: string) {
  const message = String(messageRaw || "").trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  const first = message.split(/[.?!]/)[0]?.trim() || message;
  const short = first.split(" ").filter(Boolean).slice(0, 8).join(" ").trim();
  const area = String(areaRaw || "").trim();
  const base = short || "Feedback";
  return `${area ? `${area} · ` : ""}${base}`.slice(0, 160).trim();
}

function defaultTriage(): StoredPortalFeedbackTriage {
  return { status: "new", priority: "p2" };
}

function parseLegacyReport(raw: unknown): StoredPortalFeedbackItem | null {
  if (!isPlainObject(raw)) return null;
  const id = readString(raw.id, 120);
  const createdAtIso = readString(raw.createdAtIso, 64);
  const message = readString(raw.message, 4000);
  if (!id || !createdAtIso || !message) return null;

  return {
    id,
    createdAtIso,
    title: readString(raw.title, 160) || buildPortalFeedbackTitle(message, readOptionalString(raw.area, 200)),
    message,
    category: "bug",
    severity: "medium",
    ...(readOptionalString(raw.area, 200) ? { area: readOptionalString(raw.area, 200) } : {}),
    ...(normalizePortalPath(raw.url) ? { path: normalizePortalPath(raw.url) } : {}),
    ...(readOptionalString(raw.reporterEmail, 200) ? { reporterEmail: readOptionalString(raw.reporterEmail, 200) } : {}),
    ...(readNullableString(raw.buildSha, 120) !== null ? { buildSha: readNullableString(raw.buildSha, 120) } : {}),
    ...(readNullableString(raw.commitRef, 200) !== null ? { commitRef: readNullableString(raw.commitRef, 200) } : {}),
    ...(readNullableString(raw.deploymentId, 200) !== null ? { deploymentId: readNullableString(raw.deploymentId, 200) } : {}),
    ...(sanitizePortalFeedbackMeta(raw.meta) ? { meta: sanitizePortalFeedbackMeta(raw.meta) } : {}),
    triage: defaultTriage(),
  };
}

function parseFeedbackItem(raw: unknown): StoredPortalFeedbackItem | null {
  if (!isPlainObject(raw)) return null;
  const id = readString(raw.id, 120);
  const createdAtIso = readString(raw.createdAtIso, 64);
  const title = readString(raw.title, 160);
  const message = readString(raw.message, 4000);
  if (!id || !createdAtIso || !title || !message) return null;

  const triageRaw = isPlainObject(raw.triage) ? raw.triage : {};
  return {
    id,
    createdAtIso,
    ...(readOptionalString(raw.updatedAtIso, 64) ? { updatedAtIso: readOptionalString(raw.updatedAtIso, 64) } : {}),
    title,
    message,
    ...(readOptionalString(raw.expected, 2000) ? { expected: readOptionalString(raw.expected, 2000) } : {}),
    category: readEnum(raw.category, FEEDBACK_CATEGORY_VALUES, "bug"),
    severity: readEnum(raw.severity, FEEDBACK_SEVERITY_VALUES, "medium"),
    ...(readOptionalString(raw.area, 200) ? { area: readOptionalString(raw.area, 200) } : {}),
    ...(normalizePortalPath(raw.path) ? { path: normalizePortalPath(raw.path) } : {}),
    ...(readOptionalString(raw.serviceSlug, 120) ? { serviceSlug: readOptionalString(raw.serviceSlug, 120) } : {}),
    ...(typeof raw.portalVariant === "string" && FEEDBACK_PORTAL_VARIANT_VALUES.includes(raw.portalVariant as FeedbackPortalVariant)
      ? { portalVariant: raw.portalVariant as FeedbackPortalVariant }
      : {}),
    ...(readOptionalString(raw.reporterEmail, 200) ? { reporterEmail: readOptionalString(raw.reporterEmail, 200) } : {}),
    ...(readOptionalString(raw.artifactUrl, 2000) ? { artifactUrl: readOptionalString(raw.artifactUrl, 2000) } : {}),
    ...(readNullableString(raw.buildSha, 120) !== null ? { buildSha: readNullableString(raw.buildSha, 120) } : {}),
    ...(readNullableString(raw.commitRef, 200) !== null ? { commitRef: readNullableString(raw.commitRef, 200) } : {}),
    ...(readNullableString(raw.deploymentId, 200) !== null ? { deploymentId: readNullableString(raw.deploymentId, 200) } : {}),
    ...(sanitizePortalFeedbackMeta(raw.meta) ? { meta: sanitizePortalFeedbackMeta(raw.meta) } : {}),
    triage: {
      status: readEnum(triageRaw.status, FEEDBACK_TRIAGE_STATUS_VALUES, "new"),
      priority: readEnum(triageRaw.priority, FEEDBACK_TRIAGE_PRIORITY_VALUES, "p2"),
      ...(readOptionalString(triageRaw.backlogRef, 200) ? { backlogRef: readOptionalString(triageRaw.backlogRef, 200) } : {}),
      ...(readOptionalString(triageRaw.promptRef, 200) ? { promptRef: readOptionalString(triageRaw.promptRef, 200) } : {}),
      ...(readOptionalString(triageRaw.exportBucket, 200) ? { exportBucket: readOptionalString(triageRaw.exportBucket, 200) } : {}),
      ...(readOptionalString(triageRaw.notes, 2000) ? { notes: readOptionalString(triageRaw.notes, 2000) } : {}),
      ...(readOptionalString(triageRaw.reviewerEmail, 200) ? { reviewerEmail: readOptionalString(triageRaw.reviewerEmail, 200) } : {}),
      ...(readOptionalString(triageRaw.lastReviewedAtIso, 64) ? { lastReviewedAtIso: readOptionalString(triageRaw.lastReviewedAtIso, 64) } : {}),
    },
  };
}

export function parsePortalFeedbackPayload(raw: unknown): StoredPortalFeedbackPayload {
  if (!isPlainObject(raw)) return { version: 2, items: [] };

  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => parseFeedbackItem(item)).filter((item): item is StoredPortalFeedbackItem => Boolean(item))
    : [];

  if (items.length) return { version: 2, items: items.slice(0, MAX_PORTAL_FEEDBACK_ITEMS) };

  const reports = Array.isArray(raw.reports)
    ? raw.reports.map((report) => parseLegacyReport(report)).filter((item): item is StoredPortalFeedbackItem => Boolean(item))
    : [];

  return { version: 2, items: reports.slice(0, MAX_PORTAL_FEEDBACK_ITEMS) };
}

export function appendPortalFeedbackItem(raw: unknown, item: StoredPortalFeedbackItem): StoredPortalFeedbackPayload {
  const prev = parsePortalFeedbackPayload(raw);
  return {
    version: 2,
    items: [item, ...prev.items].slice(0, MAX_PORTAL_FEEDBACK_ITEMS),
  };
}

export function updatePortalFeedbackItemTriage(raw: unknown, itemId: string, patch: PortalFeedbackTriagePatch) {
  const prev = parsePortalFeedbackPayload(raw);
  let updatedItem: StoredPortalFeedbackItem | null = null;
  const normalizedItemId = readString(itemId, 120);

  const items = prev.items.map((item) => {
    if (item.id !== normalizedItemId) return item;
    updatedItem = {
      ...item,
      updatedAtIso: patch.lastReviewedAtIso || new Date().toISOString(),
      triage: {
        status: patch.status ?? item.triage.status,
        priority: patch.priority ?? item.triage.priority,
        ...(patch.backlogRef !== undefined
          ? { backlogRef: readOptionalString(patch.backlogRef, 200) }
          : item.triage.backlogRef
            ? { backlogRef: item.triage.backlogRef }
            : {}),
        ...(patch.promptRef !== undefined
          ? { promptRef: readOptionalString(patch.promptRef, 200) }
          : item.triage.promptRef
            ? { promptRef: item.triage.promptRef }
            : {}),
        ...(patch.exportBucket !== undefined
          ? { exportBucket: readOptionalString(patch.exportBucket, 200) }
          : item.triage.exportBucket
            ? { exportBucket: item.triage.exportBucket }
            : {}),
        ...(patch.notes !== undefined
          ? { notes: readOptionalString(patch.notes, 2000) }
          : item.triage.notes
            ? { notes: item.triage.notes }
            : {}),
        ...(patch.reviewerEmail !== undefined
          ? { reviewerEmail: readOptionalString(patch.reviewerEmail, 200) }
          : item.triage.reviewerEmail
            ? { reviewerEmail: item.triage.reviewerEmail }
            : {}),
        ...(patch.lastReviewedAtIso !== undefined
          ? { lastReviewedAtIso: readOptionalString(patch.lastReviewedAtIso, 64) }
          : item.triage.lastReviewedAtIso
            ? { lastReviewedAtIso: item.triage.lastReviewedAtIso }
            : {}),
      },
    };
    return updatedItem;
  });

  return {
    payload: { version: 2 as const, items },
    item: updatedItem,
  };
}

export function bugReportSummariesFromFeedback(items: StoredPortalFeedbackItem[]) {
  return items
    .filter((item) => item.category === "bug")
    .map((item) => ({
      id: item.id,
      createdAtIso: item.createdAtIso,
      title: item.title,
      ...(item.area ? { area: item.area } : {}),
      ...(item.path ? { url: item.path } : {}),
    }));
}