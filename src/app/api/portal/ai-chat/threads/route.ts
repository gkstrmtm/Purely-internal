import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import { PURA_AI_PROFILE_VALUES, normalizePuraAiProfile } from "@/lib/puraAiProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PORTAL_AI_CHAT_DB_TIMEOUT_MS = 8_000;

class PortalAiChatDbTimeoutError extends Error {
  constructor(message = "Portal AI chat database request timed out") {
    super(message);
    this.name = "PortalAiChatDbTimeoutError";
  }
}

function isTransientPortalAiChatDbError(error: unknown): boolean {
  if (error instanceof PortalAiChatDbTimeoutError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1017" || error.code === "P2024") return true;
  }

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;

  return (
    (normalized.includes("connection pool") && normalized.includes("timed out")) ||
    normalized.includes("server has closed the connection") ||
    normalized.includes("connection terminated unexpectedly") ||
    normalized.includes("connection reset") ||
    normalized.includes("connection refused")
  );
}

async function withPortalAiChatDbTimeout<T>(work: Promise<T>, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new PortalAiChatDbTimeoutError(label || "Portal AI chat database request timed out")),
          PORTAL_AI_CHAT_DB_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withPortalAiChatDbRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number; delayMs?: number }): Promise<T> {
  const attempts = Math.max(1, Math.min(4, Math.floor(opts?.attempts ?? 3)));
  const delayMs = Math.max(50, Math.min(2_000, Math.floor(opts?.delayMs ?? 200)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withPortalAiChatDbTimeout(fn(), `Portal AI chat database request timed out on attempt ${attempt}`);
    } catch (error) {
      lastError = error;
      if (!isTransientPortalAiChatDbError(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}

function portalAiChatDbUnavailableResponse() {
  return NextResponse.json(
    { ok: false, error: "Chat is temporarily unavailable. Please try again." },
    { status: 503 },
  );
}

const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  chatMode: z.enum(["plan", "work"]).optional(),
  responseProfile: z.enum(PURA_AI_PROFILE_VALUES).optional(),
  bootstrapContext: z
    .object({
      kind: z.literal("portal_onboarding"),
      missingProfileFields: z
        .array(
          z.object({
            key: z.string().trim().min(1).max(80),
            label: z.string().trim().min(1).max(120),
          }).strict(),
        )
        .max(12)
        .optional(),
      recommendedTaskKeys: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
      summary: z.string().trim().max(1000).optional(),
    })
    .strict()
    .optional(),
});

function normalizeThreadChatMode(raw: unknown): "plan" | "work" {
  return raw === "work" ? "work" : "plan";
}

function normalizeThreadLiveStatus(raw: unknown, currentRunId?: string | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const phase = typeof (raw as any).phase === "string" ? String((raw as any).phase).trim().slice(0, 80) : null;
  const label = typeof (raw as any).label === "string" ? String((raw as any).label).trim().slice(0, 200) : null;
  const actionKey = typeof (raw as any).actionKey === "string" ? String((raw as any).actionKey).trim().slice(0, 120) : null;
  const title = typeof (raw as any).title === "string" ? String((raw as any).title).trim().slice(0, 200) : null;
  const updatedAt = typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : null;
  const runId = typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : null;
  const normalizedCurrentRunId = typeof currentRunId === "string" ? String(currentRunId).trim().slice(0, 120) : null;
  if (!normalizedCurrentRunId || !runId || runId !== normalizedCurrentRunId) return null;
  const canInterrupt = Boolean((raw as any).canInterrupt);
  const round = Number.isFinite(Number((raw as any).round)) ? Math.max(1, Math.min(99, Math.floor(Number((raw as any).round)))) : null;
  const completedSteps = Number.isFinite(Number((raw as any).completedSteps)) ? Math.max(0, Math.min(99, Math.floor(Number((raw as any).completedSteps)))) : null;
  const lastCompletedTitle =
    typeof (raw as any).lastCompletedTitle === "string" ? String((raw as any).lastCompletedTitle).trim().slice(0, 200) : null;
  if (!phase && !label && !actionKey && !title && !updatedAt && !runId && !canInterrupt && round == null && completedSteps == null && !lastCompletedTitle) return null;
  return { phase, label, actionKey, title, updatedAt, runId, canInterrupt, round, completedSteps, lastCompletedTitle };
}

function normalizeLatestRunStatus(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const status = typeof (raw as any).status === "string" ? String((raw as any).status).trim().slice(0, 40) : "";
  const runId = typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : null;
  const updatedAtValue = (raw as any).interruptedAt || (raw as any).completedAt || (raw as any).updatedAt || (raw as any).createdAt || null;
  const updatedAt = updatedAtValue ? new Date(updatedAtValue).toISOString() : null;
  if (!status) return null;
  return { status, runId, updatedAt };
}

function normalizeThreadNextStepContext(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const suggestions = Array.isArray((raw as any).suggestions)
    ? ((raw as any).suggestions as unknown[])
        .map((value) => (typeof value === "string" ? String(value).trim().slice(0, 180) : ""))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const suggestedPrompt =
    typeof (raw as any).suggestedPrompt === "string" && (raw as any).suggestedPrompt.trim()
      ? String((raw as any).suggestedPrompt).trim().slice(0, 180)
      : suggestions[0] || null;
  const objective = typeof (raw as any).objective === "string" && (raw as any).objective.trim() ? String((raw as any).objective).trim().slice(0, 400) : null;
  const workTitle = typeof (raw as any).workTitle === "string" && (raw as any).workTitle.trim() ? String((raw as any).workTitle).trim().slice(0, 200) : null;
  const summaryText = typeof (raw as any).summaryText === "string" && (raw as any).summaryText.trim() ? String((raw as any).summaryText).trim().slice(0, 280) : null;
  const updatedAt = typeof (raw as any).updatedAt === "string" && (raw as any).updatedAt.trim() ? String((raw as any).updatedAt).trim().slice(0, 80) : null;
  const canvasUrl = typeof (raw as any).canvasUrl === "string" && (raw as any).canvasUrl.trim() ? String((raw as any).canvasUrl).trim().slice(0, 1200) : null;
  if (!suggestedPrompt && !objective && !workTitle && !summaryText) return null;
  return { updatedAt, objective, workTitle, summaryText, suggestedPrompt, suggestions, canvasUrl };
}

async function loadLatestRunStatusByThread(ownerId: string, threadIds: string[]) {
  const ids = Array.from(new Set((threadIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, { status: string; runId: string | null; updatedAt: string | null }>();

  const rows = await (prisma as any).portalAiChatRun.findMany({
    where: { ownerId, threadId: { in: ids } },
    orderBy: [{ threadId: "asc" }, { createdAt: "desc" }],
    distinct: ["threadId"],
    select: {
      threadId: true,
      runId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      interruptedAt: true,
    },
  }).catch(() => []);

  const next = new Map<string, { status: string; runId: string | null; updatedAt: string | null }>();
  for (const row of rows || []) {
    const threadId = typeof (row as any)?.threadId === "string" ? String((row as any).threadId).trim() : "";
    if (!threadId || next.has(threadId)) continue;
    const normalized = normalizeLatestRunStatus(row);
    if (!normalized) continue;
    next.set(threadId, normalized);
  }
  return next;
}

export async function GET(req: Request) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  try {
    return await handleGetThreads(auth.session.user.id, (auth.session.user as any).memberId || auth.session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected portal AI chat thread list error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function handleGetThreads(ownerId: string, memberId: string) {
  try {
    await withPortalAiChatDbRetry(() => ensurePortalAiChatSchema());
  } catch (error) {
    if (isTransientPortalAiChatDbError(error)) return portalAiChatDbUnavailableResponse();
    throw error;
  }

  const now = new Date();
  // Avoid deleting a freshly-created thread during the first-send flow.
  // We only cleanup truly stale empty placeholder threads.
  const emptyThreadCleanupCutoff = new Date(now.getTime() - 10 * 60 * 1000);

  // Cleanup: remove empty placeholder threads created by older client behavior.
  // "Empty" means: no messages at all.
  try {
    await withPortalAiChatDbRetry(() =>
      (prisma as any).portalAiChatThread.deleteMany({
        where: {
          ownerId,
          isPinned: false,
          lastMessageAt: null,
          createdAt: { lt: emptyThreadCleanupCutoff },
          messages: { none: {} },
        },
      }),
    );
  } catch (error) {
    if (!isTransientPortalAiChatDbError(error)) {
      // ignore cleanup errors
    }
    // ignore cleanup errors
  }

  let threads;
  try {
    threads = await withPortalAiChatDbRetry(() =>
      (prisma as any).portalAiChatThread.findMany({
        // Never return empty threads; a thread should exist only if it has content.
        where: { ownerId, messages: { some: {} } },
        orderBy: [
          { isPinned: "desc" },
          { pinnedAt: "desc" },
          { lastMessageAt: "desc" },
          { updatedAt: "desc" },
        ],
        select: {
          id: true,
          title: true,
          lastMessageAt: true,
          isPinned: true,
          pinnedAt: true,
          createdAt: true,
          updatedAt: true,
          ownerId: true,
          createdByUserId: true,
          contextJson: true,
        },
      }),
    );
  } catch (error) {
    if (isTransientPortalAiChatDbError(error)) return portalAiChatDbUnavailableResponse();
    throw error;
  }

  const visible = (Array.isArray(threads) ? threads : [])
    .filter((t: any) => canAccessPortalAiChatThread({ thread: t, memberId }))
    .map((t: any) => {
      const ctxJson = t.contextJson && typeof t.contextJson === "object" && !Array.isArray(t.contextJson) ? (t.contextJson as any) : {};
      const currentRunId = typeof ctxJson.currentRunId === "string" ? String(ctxJson.currentRunId).trim().slice(0, 120) : null;
      return {
        id: t.id,
        title: t.title,
        lastMessageAt: t.lastMessageAt,
        isPinned: t.isPinned,
        pinnedAt: t.pinnedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        liveStatus: normalizeThreadLiveStatus(ctxJson.liveStatus, currentRunId),
        nextStepContext: normalizeThreadNextStepContext(ctxJson.nextStepContext),
        chatMode: normalizeThreadChatMode(ctxJson.chatMode),
        responseProfile: normalizePuraAiProfile(ctxJson.responseProfile),
      };
    });

  let latestRunStatusByThread;
  try {
    latestRunStatusByThread = await withPortalAiChatDbRetry(() => loadLatestRunStatusByThread(ownerId, visible.map((thread) => thread.id)));
  } catch (error) {
    if (isTransientPortalAiChatDbError(error)) return portalAiChatDbUnavailableResponse();
    throw error;
  }

  const visibleWithRuns = visible.map((thread) => {
    const latestRunStatus = latestRunStatusByThread.get(thread.id) ?? null;
    return {
      ...thread,
      liveStatus: latestRunStatus?.status === "running" ? thread.liveStatus : null,
      latestRunStatus,
    };
  });

  return NextResponse.json({ ok: true, threads: visibleWithRuns });
}

export async function POST(req: Request) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  try {
    return await handleCreateThread(req, auth.session.user.id, auth.session.user.memberId || auth.session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected portal AI chat thread create error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function handleCreateThread(req: Request, ownerId: string, createdByUserId: string) {
  try {
    await withPortalAiChatDbRetry(() => ensurePortalAiChatSchema());
  } catch (error) {
    if (isTransientPortalAiChatDbError(error)) return portalAiChatDbUnavailableResponse();
    throw error;
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateThreadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const title = parsed.data.title?.trim() || "New chat";
  const chatMode = normalizeThreadChatMode(parsed.data.chatMode);
  const responseProfile = normalizePuraAiProfile(parsed.data.responseProfile);
  const bootstrapContext = parsed.data.bootstrapContext ?? null;

  let thread;
  try {
    thread = await withPortalAiChatDbRetry(() =>
      (prisma as any).portalAiChatThread.create({
        data: {
          ownerId,
          title,
          createdByUserId,
          lastMessageAt: null,
          isPinned: false,
          pinnedAt: null,
          contextJson: { chatMode, responseProfile, ...(bootstrapContext ? { bootstrapContext } : {}) },
        },
        select: {
          id: true,
          title: true,
          lastMessageAt: true,
          isPinned: true,
          pinnedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
  } catch (error) {
    if (isTransientPortalAiChatDbError(error)) return portalAiChatDbUnavailableResponse();
    throw error;
  }

  return NextResponse.json({ ok: true, thread: { ...(thread as any), chatMode, responseProfile } });
}
