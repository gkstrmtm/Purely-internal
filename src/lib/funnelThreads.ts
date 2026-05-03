import { sanitizeSourceActionPlan, type SourceActionPlan } from "@/lib/funnelSourceActionPlan";

export const FUNNEL_THREAD_KIND_VALUES = [
  "main",
  "page",
  "design",
  "copy",
  "source",
  "setup",
  "performance",
  "alternate",
] as const;

export type FunnelThreadKind = (typeof FUNNEL_THREAD_KIND_VALUES)[number];

export type FunnelThreadMessage = {
  role: "user" | "assistant";
  content: string;
  at?: string;
  sourceActionPlan?: SourceActionPlan;
};

export type FunnelThreadRecord = {
  id: string;
  funnelId: string;
  pageId: string | null;
  title: string;
  kind: FunnelThreadKind;
  messages: FunnelThreadMessage[];
  context: Record<string, unknown> | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const MAX_THREAD_MESSAGES = 24;

export function normalizeFunnelThreadKind(raw: unknown): FunnelThreadKind {
  const value = String(raw || "").trim().toLowerCase();
  return (FUNNEL_THREAD_KIND_VALUES as readonly string[]).includes(value) ? (value as FunnelThreadKind) : "main";
}

export function normalizeFunnelThreadTitle(raw: unknown, fallback = "Main thread") {
  const title = String(typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ").slice(0, 120);
  return title || fallback;
}

export function normalizeFunnelThreadContext(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { ...(raw as Record<string, unknown>) };
}

export function normalizeFunnelThreadMessages(raw: unknown): FunnelThreadMessage[] {
  if (!Array.isArray(raw)) return [];

  const messages: FunnelThreadMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const role = entry.role === "assistant" ? "assistant" : entry.role === "user" ? "user" : null;
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    const at = typeof entry.at === "string" && entry.at.trim() ? entry.at.trim() : undefined;
    const sourceActionPlan = sanitizeSourceActionPlan(entry.sourceActionPlan);
    if (!role || !content) continue;
    messages.push({
      role,
      content,
      ...(at ? { at } : {}),
      ...(sourceActionPlan ? { sourceActionPlan } : {}),
    });
  }

  return messages.slice(-MAX_THREAD_MESSAGES);
}

export function readFunnelThreadLastMessageAt(messages: FunnelThreadMessage[], fallback?: Date | string | null) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const at = messages[index]?.at;
    if (typeof at === "string" && at.trim()) return at.trim();
  }

  if (fallback instanceof Date) return fallback.toISOString();
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  return null;
}

export function buildDefaultFunnelThreadTitle(input?: { kind?: unknown; pageTitle?: unknown }) {
  const kind = normalizeFunnelThreadKind(input?.kind);
  const pageTitle = String(typeof input?.pageTitle === "string" ? input.pageTitle : "").trim();

  if (kind === "page") return pageTitle || "Page";
  if (kind === "design") return pageTitle ? `${pageTitle} design` : "Design";
  if (kind === "copy") return pageTitle ? `${pageTitle} copy` : "Copy";
  if (kind === "source") return pageTitle ? `${pageTitle} source` : "Source";
  if (kind === "setup") return pageTitle ? `${pageTitle} setup` : "Setup";
  if (kind === "performance") return pageTitle ? `${pageTitle} performance` : "Performance";
  if (kind === "alternate") return pageTitle ? `${pageTitle} chat` : "Chat";
  return "Main";
}

export function toFunnelThreadRecord(thread: {
  id: string;
  funnelId: string;
  pageId: string | null;
  title: string;
  kind: string;
  messagesJson: unknown;
  contextJson: unknown;
  lastMessageAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): FunnelThreadRecord {
  return {
    id: thread.id,
    funnelId: thread.funnelId,
    pageId: thread.pageId,
    title: normalizeFunnelThreadTitle(thread.title),
    kind: normalizeFunnelThreadKind(thread.kind),
    messages: normalizeFunnelThreadMessages(thread.messagesJson),
    context: normalizeFunnelThreadContext(thread.contextJson),
    lastMessageAt:
      thread.lastMessageAt instanceof Date
        ? thread.lastMessageAt.toISOString()
        : typeof thread.lastMessageAt === "string" && thread.lastMessageAt.trim()
          ? thread.lastMessageAt.trim()
          : null,
    createdAt: thread.createdAt instanceof Date ? thread.createdAt.toISOString() : String(thread.createdAt),
    updatedAt: thread.updatedAt instanceof Date ? thread.updatedAt.toISOString() : String(thread.updatedAt),
  };
}

function sortFunnelThreads(threads: FunnelThreadRecord[]) {
  return [...threads].sort((left, right) => {
    const leftAt = Date.parse(left.lastMessageAt || left.updatedAt || left.createdAt || "") || 0;
    const rightAt = Date.parse(right.lastMessageAt || right.updatedAt || right.createdAt || "") || 0;
    return rightAt - leftAt;
  });
}

export function readPersistedFunnelThreads(settingsJson: unknown, funnelId: string): FunnelThreadRecord[] {
  if (!funnelId || !settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return [];
  const rawStore = (settingsJson as Record<string, unknown>).funnelThreads;
  if (!rawStore || typeof rawStore !== "object" || Array.isArray(rawStore)) return [];
  const rawThreads = (rawStore as Record<string, unknown>)[funnelId];
  if (!Array.isArray(rawThreads)) return [];

  const normalized: FunnelThreadRecord[] = [];
  for (const item of rawThreads) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const thread = item as Record<string, unknown>;
    const id = typeof thread.id === "string" && thread.id.trim() ? thread.id.trim() : "";
    const createdAt = typeof thread.createdAt === "string" && thread.createdAt.trim() ? thread.createdAt.trim() : new Date().toISOString();
    const updatedAt = typeof thread.updatedAt === "string" && thread.updatedAt.trim() ? thread.updatedAt.trim() : createdAt;
    if (!id) continue;
    normalized.push({
      id,
      funnelId,
      pageId: typeof thread.pageId === "string" && thread.pageId.trim() ? thread.pageId.trim() : null,
      title: normalizeFunnelThreadTitle(thread.title),
      kind: normalizeFunnelThreadKind(thread.kind),
      messages: normalizeFunnelThreadMessages(thread.messages),
      context: normalizeFunnelThreadContext(thread.context),
      lastMessageAt: readFunnelThreadLastMessageAt(normalizeFunnelThreadMessages(thread.messages), typeof thread.lastMessageAt === "string" ? thread.lastMessageAt : updatedAt),
      createdAt,
      updatedAt,
    });
  }

  return sortFunnelThreads(normalized);
}

export function writePersistedFunnelThreads(settingsJson: unknown, funnelId: string, threads: FunnelThreadRecord[]) {
  const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson)
    ? { ...(settingsJson as Record<string, unknown>) }
    : {};
  const threadStore =
    base.funnelThreads && typeof base.funnelThreads === "object" && !Array.isArray(base.funnelThreads)
      ? { ...(base.funnelThreads as Record<string, unknown>) }
      : {};

  const nextThreads = sortFunnelThreads(threads).map((thread) => ({
    id: thread.id,
    pageId: thread.pageId,
    title: normalizeFunnelThreadTitle(thread.title),
    kind: normalizeFunnelThreadKind(thread.kind),
    messages: normalizeFunnelThreadMessages(thread.messages),
    context: normalizeFunnelThreadContext(thread.context),
    lastMessageAt: thread.lastMessageAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  }));

  if (nextThreads.length) threadStore[funnelId] = nextThreads;
  else delete threadStore[funnelId];

  base.funnelThreads = threadStore;
  return base;
}