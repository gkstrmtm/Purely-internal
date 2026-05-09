import { requireClientSession } from "@/lib/apiAuth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";

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

function normalizeThreadLiveStatus(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const phase = typeof (raw as any).phase === "string" ? String((raw as any).phase).trim().slice(0, 80) : null;
  const label = typeof (raw as any).label === "string" ? String((raw as any).label).trim().slice(0, 200) : null;
  const actionKey = typeof (raw as any).actionKey === "string" ? String((raw as any).actionKey).trim().slice(0, 120) : null;
  const title = typeof (raw as any).title === "string" ? String((raw as any).title).trim().slice(0, 200) : null;
  const updatedAt = typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : null;
  const runId = typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : null;
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

  const rows = (await withPortalAiChatDbRetry(() =>
    (prisma as any).portalAiChatRun.findMany({
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
    }),
  ).catch(() => [])) as any[];

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

async function loadVisibleThreads(ownerId: string, memberId: string) {
  const threads = await withPortalAiChatDbRetry(() =>
    (prisma as any).portalAiChatThread.findMany({
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

  const visible = (Array.isArray(threads) ? threads : [])
    .filter((thread: any) => canAccessPortalAiChatThread({ thread, memberId }))
    .map((thread: any) => {
      const ctxJson = thread.contextJson && typeof thread.contextJson === "object" && !Array.isArray(thread.contextJson) ? (thread.contextJson as any) : {};
      return {
        id: thread.id,
        title: thread.title,
        lastMessageAt: thread.lastMessageAt,
        isPinned: thread.isPinned,
        pinnedAt: thread.pinnedAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        liveStatus: normalizeThreadLiveStatus(ctxJson.liveStatus),
        nextStepContext: normalizeThreadNextStepContext(ctxJson.nextStepContext),
      };
    });

  const latestRunStatusByThread = await loadLatestRunStatusByThread(ownerId, visible.map((thread) => thread.id));
  return visible.map((thread) => ({
    ...thread,
    latestRunStatus: latestRunStatusByThread.get(thread.id) ?? null,
  }));
}

export async function GET(req: Request) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }), {
      status: auth.status,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    await withPortalAiChatDbRetry(() => ensurePortalAiChatSchema());
  } catch (error) {
    if (isTransientPortalAiChatDbError(error)) {
      return new Response(JSON.stringify({ ok: false, error: "Chat is temporarily unavailable. Please try again." }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    throw error;
  }

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastPayload = "";
      let snapshotInterval: ReturnType<typeof setInterval> | null = null;
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (snapshotInterval) clearInterval(snapshotInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // ignore close races
        }
      };

      const push = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      const pushComment = (comment: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ${comment}\n\n`));
      };

      const sendSnapshot = async () => {
        const threads = await loadVisibleThreads(ownerId, memberId);
        const payload = JSON.stringify({ ok: true, threads });
        if (payload === lastPayload) return;
        lastPayload = payload;
        push("threads", { ok: true, threads });
      };

      void sendSnapshot().catch((error) => {
        if (!isTransientPortalAiChatDbError(error)) close();
      });
      snapshotInterval = setInterval(() => {
        void sendSnapshot().catch((error) => {
          if (!isTransientPortalAiChatDbError(error)) close();
        });
      }, 2000);
      heartbeatInterval = setInterval(() => {
        pushComment("keepalive");
      }, 15000);

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
