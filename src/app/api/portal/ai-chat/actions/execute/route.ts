import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { persistPortalAiChatRun } from "@/lib/portalAiChatRunLedger";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import {
  PortalAgentActionKeySchema,
  type PortalAgentActionKey,
} from "@/lib/portalAgentActions";
import { executePortalAgentActionForThread } from "@/lib/portalAgentActionExecutor";
import { getConfirmSpecForPortalAgentAction } from "@/lib/portalAgentActionMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    threadId: z.string().trim().min(1).max(120),
    action: PortalAgentActionKeySchema,
    args: z.object({}).catchall(z.unknown()).optional(),
    confirmToken: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const ACTION_CONFIRM_TTL_MS = 15 * 60 * 1000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function normalizeThreadContext(contextJson: unknown): Record<string, unknown> {
  return contextJson && typeof contextJson === "object" && !Array.isArray(contextJson)
    ? ({ ...(contextJson as Record<string, unknown>) } as Record<string, unknown>)
    : {};
}

function pendingConfirmMatches(opts: {
  pendingConfirm: unknown;
  confirmToken: string;
  action: PortalAgentActionKey;
  args: Record<string, unknown>;
}): boolean {
  const pendingConfirm = opts.pendingConfirm && typeof opts.pendingConfirm === "object" && !Array.isArray(opts.pendingConfirm)
    ? (opts.pendingConfirm as Record<string, unknown>)
    : null;
  if (!pendingConfirm) return false;
  if (String(pendingConfirm.token || "") !== opts.confirmToken) return false;

  const createdAtMs = Date.parse(String(pendingConfirm.createdAt || ""));
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > ACTION_CONFIRM_TTL_MS) return false;

  const steps = Array.isArray(pendingConfirm.steps) ? pendingConfirm.steps : [];
  const targetStep = steps.find((step) => String((step as any)?.key || "") === String(opts.action));
  if (!targetStep) return false;

  return stableJson((targetStep as any)?.args ?? {}) === stableJson(opts.args);
}

function buildFollowUpSuggestions(opts: { action: string; linkUrl?: string | null; ok: boolean }) {
  if (!opts.ok) return [] as string[];
  const haystack = [String(opts.action || ""), String(opts.linkUrl || "")].join("\n").toLowerCase();
  const suggestions: string[] = [];
  const push = (value: string) => {
    const trimmed = String(value || "").trim().slice(0, 180);
    if (!trimmed || suggestions.includes(trimmed)) return;
    suggestions.push(trimmed);
  };
  if (/booking|calendar|appointment/.test(haystack)) push("Audit the booking flow for the next bottleneck.");
  if (/funnel|landing|checkout|page/.test(haystack)) push("Review this funnel for the next highest-impact improvement.");
  if (/contact|lead|client|customer/.test(haystack)) push("Suggest the next best follow-up for this contact.");
  if (/inbox|email|sms|thread/.test(haystack)) push("Draft the next follow-up message you would send here.");
  push("Summarize what changed and tell me the next best step.");
  push("What should Pura do next here?");
  return suggestions.slice(0, 3);
}

export async function POST(req: Request) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const threadId = parsed.data.threadId;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!canAccessPortalAiChatThread({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const action = parsed.data.action;
  const argsRaw = parsed.data.args ?? {};
  const confirmToken = typeof parsed.data.confirmToken === "string" ? parsed.data.confirmToken.trim().slice(0, 200) : "";
  const confirmSpec = getConfirmSpecForPortalAgentAction(action as PortalAgentActionKey);
  const prevCtx = normalizeThreadContext(thread.contextJson);

  if (confirmSpec) {
    const pendingConfirm = prevCtx.pendingConfirm;
    const confirmed = confirmToken
      ? pendingConfirmMatches({
          pendingConfirm,
          confirmToken,
          action: action as PortalAgentActionKey,
          args: argsRaw,
        })
      : false;

    if (!confirmed) {
      const token = randomUUID();
      const nextCtx = {
        ...prevCtx,
        pendingConfirm: {
          token,
          createdAt: new Date().toISOString(),
          workTitle: String(action).slice(0, 160),
          steps: [{ key: action, title: String(action).slice(0, 160), args: argsRaw }],
          confirm: confirmSpec,
        },
      };
      await (prisma as any).portalAiChatThread
        .update({ where: { id: threadId }, data: { contextJson: nextCtx, lastMessageAt: new Date() } })
        .catch(() => null);

      return NextResponse.json({
        ok: true,
        needsConfirm: { ...(confirmSpec as any), token },
        clientUiActions: [],
      });
    }
  }

  const exec = await executePortalAgentActionForThread({
    ownerId,
    actorUserId: memberId,
    threadId,
    action: action as PortalAgentActionKey,
    args: argsRaw,
  });

  if (!exec.ok && exec.status === 400) {
    return NextResponse.json({ ok: false, error: exec.error || "Invalid action args" }, { status: 400 });
  }

  const cua = (exec as any)?.clientUiAction ?? null;
  const assistantMessage = (exec as any)?.assistantMessage ?? null;
  const runTrace = {
    at: new Date().toISOString(),
    workTitle: String((exec as any)?.assistantMessage?.text || "").trim() ? String(action).slice(0, 120) : String(action).slice(0, 120),
    assistantMessageId: assistantMessage && typeof assistantMessage.id === "string" ? String(assistantMessage.id).trim().slice(0, 200) : null,
    steps: [
      {
        key: String(action).slice(0, 120),
        title: String(action).slice(0, 160),
        ok: Boolean((exec as any)?.ok),
        linkUrl: typeof (exec as any)?.linkUrl === "string" ? String((exec as any).linkUrl).trim().slice(0, 1200) : null,
      },
    ],
    canvasUrl: typeof (exec as any)?.linkUrl === "string" ? String((exec as any).linkUrl).trim().slice(0, 1200) : null,
  };

  const prevRuns = Array.isArray(prevCtx.runs) ? (prevCtx.runs as unknown[]) : [];
  const nextCtx = {
    ...prevCtx,
    pendingConfirm: confirmSpec ? null : prevCtx.pendingConfirm,
    lastWorkTitle: runTrace.workTitle,
    lastCanvasUrl: runTrace.canvasUrl,
    runs: [...prevRuns.slice(-19), runTrace],
  };
  await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx, lastMessageAt: new Date() } }).catch(() => null);

  const followUpSuggestions = buildFollowUpSuggestions({
    action: String(action),
    linkUrl: runTrace.canvasUrl,
    ok: Boolean((exec as any)?.ok),
  });

  await persistPortalAiChatRun({
    ownerId,
    threadId,
    runTrace,
    triggerKind: "assistant_action",
    status: Boolean((exec as any)?.ok) ? "completed" : "failed",
    summaryText: typeof assistantMessage?.text === "string" ? assistantMessage.text : null,
    followUpSuggestions,
    completedAt: new Date(),
  });

  return NextResponse.json({
    ...(exec as any),
    runTrace,
    followUpSuggestions,
    clientUiActions: Array.isArray((exec as any)?.clientUiActions)
      ? (exec as any).clientUiActions
      : cua
        ? [cua]
        : [],
  });
}
