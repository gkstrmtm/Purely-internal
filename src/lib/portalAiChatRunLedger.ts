import { prisma } from "@/lib/db";

export type PortalAiChatRunStep = {
  key: string;
  title: string;
  ok: boolean;
  linkUrl?: string | null;
};

export type PortalAiChatRunStatus = "completed" | "partial" | "failed" | "needs_input" | "interrupted";
export type PortalAiChatRunTriggerKind = "chat" | "assistant_action" | "scheduled";

export type PortalAiChatRunTraceInput = {
  at?: string | null;
  workTitle?: string | null;
  assistantMessageId?: string | null;
  scheduledMessageId?: string | null;
  canvasUrl?: string | null;
  steps?: unknown;
};

function normalizeStep(raw: unknown): PortalAiChatRunStep | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const key = typeof (raw as any).key === "string" ? String((raw as any).key).trim().slice(0, 120) : "";
  const title = typeof (raw as any).title === "string" ? String((raw as any).title).trim().slice(0, 200) : "";
  const linkUrl = typeof (raw as any).linkUrl === "string" ? String((raw as any).linkUrl).trim().slice(0, 1200) : null;
  if (!key && !title) return null;
  return { key, title: title || key, ok: Boolean((raw as any).ok), linkUrl };
}

export function normalizePortalAiChatRunSteps(raw: unknown): PortalAiChatRunStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: PortalAiChatRunStep[] = [];
  for (const value of raw) {
    const step = normalizeStep(value);
    if (!step) continue;
    steps.push(step);
    if (steps.length >= 20) break;
  }
  return steps;
}

export function normalizePortalAiChatFollowUpSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => (typeof value === "string" ? String(value).trim().slice(0, 180) : ""))
    .filter(Boolean)
    .slice(0, 5);
}

export async function persistPortalAiChatRun(opts: {
  ownerId: string;
  threadId: string;
  runTrace: PortalAiChatRunTraceInput;
  status: PortalAiChatRunStatus;
  triggerKind: PortalAiChatRunTriggerKind;
  runId?: string | null;
  summaryText?: string | null;
  followUpSuggestions?: unknown;
  completedAt?: Date | null;
  interruptedAt?: Date | null;
}) {
  const ownerId = String(opts.ownerId || "").trim();
  const threadId = String(opts.threadId || "").trim();
  if (!ownerId || !threadId) return;

  const trace = opts.runTrace && typeof opts.runTrace === "object" && !Array.isArray(opts.runTrace) ? opts.runTrace : {};
  const createdAtRaw = typeof trace.at === "string" ? String(trace.at).trim() : "";
  const createdAtMs = createdAtRaw ? Date.parse(createdAtRaw) : NaN;
  const createdAt = Number.isFinite(createdAtMs) ? new Date(createdAtMs) : new Date();
  const steps = normalizePortalAiChatRunSteps(trace.steps);
  const followUpSuggestions = normalizePortalAiChatFollowUpSuggestions(opts.followUpSuggestions);

  await (prisma as any).portalAiChatRun.create({
    data: {
      ownerId,
      threadId,
      assistantMessageId:
        typeof trace.assistantMessageId === "string" && trace.assistantMessageId.trim()
          ? String(trace.assistantMessageId).trim().slice(0, 200)
          : null,
      scheduledMessageId:
        typeof trace.scheduledMessageId === "string" && trace.scheduledMessageId.trim()
          ? String(trace.scheduledMessageId).trim().slice(0, 200)
          : null,
      runId: typeof opts.runId === "string" && opts.runId.trim() ? String(opts.runId).trim().slice(0, 120) : null,
      triggerKind: String(opts.triggerKind).trim().slice(0, 40),
      status: String(opts.status).trim().slice(0, 40),
      workTitle: typeof trace.workTitle === "string" && trace.workTitle.trim() ? String(trace.workTitle).trim().slice(0, 200) : null,
      canvasUrl: typeof trace.canvasUrl === "string" && trace.canvasUrl.trim() ? String(trace.canvasUrl).trim().slice(0, 1200) : null,
      summaryText: typeof opts.summaryText === "string" && opts.summaryText.trim() ? String(opts.summaryText).trim().slice(0, 4000) : null,
      stepsJson: steps.length ? steps : null,
      followUpSuggestionsJson: followUpSuggestions.length ? followUpSuggestions : null,
      createdAt,
      completedAt: opts.completedAt ?? null,
      interruptedAt: opts.interruptedAt ?? null,
    },
  }).catch(() => null);
}

export function normalizePortalAiChatRunRecord(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return {
    id: typeof (raw as any).id === "string" ? String((raw as any).id).trim().slice(0, 200) : "",
    runId: typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : null,
    triggerKind: typeof (raw as any).triggerKind === "string" ? String((raw as any).triggerKind).trim().slice(0, 40) : "chat",
    status: typeof (raw as any).status === "string" ? String((raw as any).status).trim().slice(0, 40) : "completed",
    workTitle: typeof (raw as any).workTitle === "string" ? String((raw as any).workTitle).trim().slice(0, 200) : null,
    canvasUrl: typeof (raw as any).canvasUrl === "string" ? String((raw as any).canvasUrl).trim().slice(0, 1200) : null,
    summaryText: typeof (raw as any).summaryText === "string" ? String((raw as any).summaryText).trim().slice(0, 4000) : null,
    assistantMessageId: typeof (raw as any).assistantMessageId === "string" ? String((raw as any).assistantMessageId).trim().slice(0, 200) : null,
    scheduledMessageId: typeof (raw as any).scheduledMessageId === "string" ? String((raw as any).scheduledMessageId).trim().slice(0, 200) : null,
    createdAt: typeof (raw as any).createdAt === "string" ? String((raw as any).createdAt).trim().slice(0, 80) : raw instanceof Date ? raw.toISOString() : new Date((raw as any).createdAt || Date.now()).toISOString(),
    completedAt: (raw as any).completedAt ? new Date((raw as any).completedAt).toISOString() : null,
    interruptedAt: (raw as any).interruptedAt ? new Date((raw as any).interruptedAt).toISOString() : null,
    steps: normalizePortalAiChatRunSteps((raw as any).stepsJson),
    followUpSuggestions: normalizePortalAiChatFollowUpSuggestions((raw as any).followUpSuggestionsJson),
  };
}
