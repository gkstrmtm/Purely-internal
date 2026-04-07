import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import { PURA_AI_PROFILE_VALUES, normalizePuraAiProfile } from "@/lib/puraAiProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  chatMode: z.enum(["plan", "work"]).optional(),
  responseProfile: z.enum(PURA_AI_PROFILE_VALUES).optional(),
});

function normalizeThreadChatMode(raw: unknown): "plan" | "work" {
  return raw === "work" ? "work" : "plan";
}

function normalizeThreadLiveStatus(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const phase = typeof (raw as any).phase === "string" ? String((raw as any).phase).trim().slice(0, 80) : null;
  const label = typeof (raw as any).label === "string" ? String((raw as any).label).trim().slice(0, 200) : null;
  const actionKey = typeof (raw as any).actionKey === "string" ? String((raw as any).actionKey).trim().slice(0, 120) : null;
  const title = typeof (raw as any).title === "string" ? String((raw as any).title).trim().slice(0, 200) : null;
  const updatedAt = typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : null;
  const round = Number.isFinite(Number((raw as any).round)) ? Math.max(1, Math.min(99, Math.floor(Number((raw as any).round)))) : null;
  const completedSteps = Number.isFinite(Number((raw as any).completedSteps)) ? Math.max(0, Math.min(99, Math.floor(Number((raw as any).completedSteps)))) : null;
  const lastCompletedTitle =
    typeof (raw as any).lastCompletedTitle === "string" ? String((raw as any).lastCompletedTitle).trim().slice(0, 200) : null;
  if (!phase && !label && !actionKey && !title && !updatedAt && round == null && completedSteps == null && !lastCompletedTitle) return null;
  return { phase, label, actionKey, title, updatedAt, round, completedSteps, lastCompletedTitle };
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
  const ids = Array.from(new Set((threadIds || []).map((id) => String(id || "").trim()).filter(Boolean))).slice(0, 200);
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

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  const now = new Date();
  // Avoid deleting a freshly-created thread during the first-send flow.
  // We only cleanup truly stale empty placeholder threads.
  const emptyThreadCleanupCutoff = new Date(now.getTime() - 10 * 60 * 1000);

  // Cleanup: remove empty placeholder threads created by older client behavior.
  // "Empty" means: no messages at all.
  try {
    await (prisma as any).portalAiChatThread.deleteMany({
      where: {
        ownerId,
        isPinned: false,
        lastMessageAt: null,
        createdAt: { lt: emptyThreadCleanupCutoff },
        messages: { none: {} },
      },
    });
  } catch {
    // ignore cleanup errors
  }

  const threads = await (prisma as any).portalAiChatThread.findMany({
    // Never return empty threads; a thread should exist only if it has content.
    where: { ownerId, messages: { some: {} } },
    orderBy: [
      { isPinned: "desc" },
      { pinnedAt: "desc" },
      { lastMessageAt: "desc" },
      { updatedAt: "desc" },
    ],
    take: 200,
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
  });

  const visible = (Array.isArray(threads) ? threads : [])
    .filter((t: any) => canAccessPortalAiChatThread({ thread: t, memberId }))
    .map((t: any) => {
      const ctxJson = t.contextJson && typeof t.contextJson === "object" && !Array.isArray(t.contextJson) ? (t.contextJson as any) : {};
      return {
        id: t.id,
        title: t.title,
        lastMessageAt: t.lastMessageAt,
        isPinned: t.isPinned,
        pinnedAt: t.pinnedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        liveStatus: normalizeThreadLiveStatus(ctxJson.liveStatus),
        nextStepContext: normalizeThreadNextStepContext(ctxJson.nextStepContext),
        chatMode: normalizeThreadChatMode(ctxJson.chatMode),
        responseProfile: normalizePuraAiProfile(ctxJson.responseProfile),
      };
    });

  const latestRunStatusByThread = await loadLatestRunStatusByThread(ownerId, visible.map((thread) => thread.id));

  const visibleWithRuns = visible.map((thread) => ({
    ...thread,
    latestRunStatus: latestRunStatusByThread.get(thread.id) ?? null,
  }));

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

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const createdByUserId = auth.session.user.memberId || ownerId;

  const body = await req.json().catch(() => null);
  const parsed = CreateThreadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const title = parsed.data.title?.trim() || "New chat";
  const chatMode = normalizeThreadChatMode(parsed.data.chatMode);
  const responseProfile = normalizePuraAiProfile(parsed.data.responseProfile);

  const thread = await (prisma as any).portalAiChatThread.create({
    data: {
      ownerId,
      title,
      createdByUserId,
      lastMessageAt: null,
      isPinned: false,
      pinnedAt: null,
      contextJson: { chatMode, responseProfile },
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
  });

  return NextResponse.json({ ok: true, thread: { ...thread, chatMode, responseProfile } });
}
