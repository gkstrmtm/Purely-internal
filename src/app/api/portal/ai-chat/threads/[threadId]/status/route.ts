import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeThreadContext(raw: unknown) {
  const ctxJson = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const lastCanvasUrl =
    typeof ctxJson.lastCanvasUrl === "string" && ctxJson.lastCanvasUrl.trim() ? String(ctxJson.lastCanvasUrl).trim().slice(0, 1200) : null;
  const lastWorkTitle =
    typeof ctxJson.lastWorkTitle === "string" && ctxJson.lastWorkTitle.trim() ? String(ctxJson.lastWorkTitle).trim().slice(0, 200) : null;
  const liveStatus =
    ctxJson.liveStatus && typeof ctxJson.liveStatus === "object" && !Array.isArray(ctxJson.liveStatus)
      ? {
          phase: typeof ctxJson.liveStatus.phase === "string" ? String(ctxJson.liveStatus.phase).trim().slice(0, 80) : null,
          label: typeof ctxJson.liveStatus.label === "string" ? String(ctxJson.liveStatus.label).trim().slice(0, 200) : null,
          actionKey: typeof ctxJson.liveStatus.actionKey === "string" ? String(ctxJson.liveStatus.actionKey).trim().slice(0, 120) : null,
          title: typeof ctxJson.liveStatus.title === "string" ? String(ctxJson.liveStatus.title).trim().slice(0, 200) : null,
          updatedAt: typeof ctxJson.liveStatus.updatedAt === "string" ? String(ctxJson.liveStatus.updatedAt).trim().slice(0, 80) : null,
          runId: typeof ctxJson.liveStatus.runId === "string" ? String(ctxJson.liveStatus.runId).trim().slice(0, 120) : null,
          canInterrupt: Boolean(ctxJson.liveStatus.canInterrupt),
          round: Number.isFinite(Number(ctxJson.liveStatus.round)) ? Math.max(1, Math.min(99, Math.floor(Number(ctxJson.liveStatus.round)))) : null,
          completedSteps: Number.isFinite(Number(ctxJson.liveStatus.completedSteps))
            ? Math.max(0, Math.min(99, Math.floor(Number(ctxJson.liveStatus.completedSteps))))
            : null,
          lastCompletedTitle:
            typeof ctxJson.liveStatus.lastCompletedTitle === "string"
              ? String(ctxJson.liveStatus.lastCompletedTitle).trim().slice(0, 200)
              : null,
        }
      : null;

  return { lastCanvasUrl, lastWorkTitle, liveStatus };
}

export async function GET(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }), {
      status: auth.status,
      headers: { "content-type": "application/json" },
    });
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { threadId } = await ctx.params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastPayload = "";
      let statusInterval: ReturnType<typeof setInterval> | null = null;
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (statusInterval) clearInterval(statusInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // ignore close races
        }
      };

      const push = (event: string, payload: unknown) => {
        if (closed) return;
        const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(encoder.encode(body));
      };

      const pushComment = (comment: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ${comment}\n\n`));
      };

      const sendSnapshot = async () => {
        const thread = await (prisma as any).portalAiChatThread.findFirst({
          where: { id: threadId, ownerId },
          select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
        });
        if (!thread || !canAccessPortalAiChatThread({ thread, memberId })) {
          push("closed", { ok: false, error: "Not found" });
          close();
          return;
        }

        const threadContext = normalizeThreadContext(thread.contextJson);
        const payload = JSON.stringify({ ok: true, threadContext });
        if (payload === lastPayload) return;
        lastPayload = payload;
        push("status", { ok: true, threadContext });
      };

      void sendSnapshot().catch(() => close());
      statusInterval = setInterval(() => {
        void sendSnapshot().catch(() => close());
      }, 1200);
      heartbeatInterval = setInterval(() => {
        pushComment("keepalive");
      }, 15000);

      req.signal.addEventListener("abort", close);
    },
    cancel() {
      try {
        req.signal.throwIfAborted?.();
      } catch {
        // ignore
      }
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
