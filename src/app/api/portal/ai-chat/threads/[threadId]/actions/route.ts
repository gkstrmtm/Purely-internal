import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { isPortalAiChatThreadOwner } from "@/lib/portalAiChatSharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ActionSchema = z.object({
  action: z.enum(["pin", "unpin", "delete", "duplicate", "interrupt"]),
});

function normalizeThreadLiveStatus(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const phase = typeof (raw as any).phase === "string" ? String((raw as any).phase).trim().slice(0, 80) : null;
  const label = typeof (raw as any).label === "string" ? String((raw as any).label).trim().slice(0, 200) : null;
  const actionKey = typeof (raw as any).actionKey === "string" ? String((raw as any).actionKey).trim().slice(0, 120) : null;
  const title = typeof (raw as any).title === "string" ? String((raw as any).title).trim().slice(0, 200) : null;
  const updatedAt = typeof (raw as any).updatedAt === "string" ? String((raw as any).updatedAt).trim().slice(0, 80) : null;
  const runId = typeof (raw as any).runId === "string" ? String((raw as any).runId).trim().slice(0, 120) : null;
  const round = Number.isFinite(Number((raw as any).round)) ? Math.max(1, Math.min(99, Math.floor(Number((raw as any).round)))) : null;
  const completedSteps = Number.isFinite(Number((raw as any).completedSteps)) ? Math.max(0, Math.min(99, Math.floor(Number((raw as any).completedSteps)))) : null;
  const lastCompletedTitle = typeof (raw as any).lastCompletedTitle === "string" ? String((raw as any).lastCompletedTitle).trim().slice(0, 200) : null;
  if (!phase && !label && !actionKey && !title && !updatedAt && !runId && round == null && completedSteps == null && !lastCompletedTitle) return null;
  return { phase, label, actionKey, title, updatedAt, runId, canInterrupt: Boolean(runId), round, completedSteps, lastCompletedTitle };
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
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
  const memberId = createdByUserId;
  const { threadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const action = parsed.data.action;

  // Verify thread exists and belongs to user
  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, title: true, contextJson: true, ownerId: true, createdByUserId: true },
  });
  if (!thread) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (!isPortalAiChatThreadOwner({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (action === "pin") {
    const now = new Date();
    const updated = await (prisma as any).portalAiChatThread.update({
      where: { id: threadId },
      data: { isPinned: true, pinnedAt: now },
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
    return NextResponse.json({ ok: true, thread: updated });
  }

  if (action === "unpin") {
    const updated = await (prisma as any).portalAiChatThread.update({
      where: { id: threadId },
      data: { isPinned: false },
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
    return NextResponse.json({ ok: true, thread: updated });
  }

  if (action === "delete") {
    // Delete thread and all its messages
    await (prisma as any).portalAiChatMessage.deleteMany({
      where: { ownerId, threadId },
    });
    await (prisma as any).portalAiChatThread.delete({
      where: { id: threadId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "interrupt") {
    const ctxJson = thread.contextJson && typeof thread.contextJson === "object" && !Array.isArray(thread.contextJson) ? (thread.contextJson as any) : {};
    const liveStatus = ctxJson.liveStatus && typeof ctxJson.liveStatus === "object" && !Array.isArray(ctxJson.liveStatus) ? (ctxJson.liveStatus as any) : null;
    const runId = typeof liveStatus?.runId === "string" ? String(liveStatus.runId).trim() : typeof ctxJson.currentRunId === "string" ? String(ctxJson.currentRunId).trim() : "";

    if (!runId) {
      return NextResponse.json({ ok: true, interrupted: false, liveStatus: null });
    }

    const nextCtx = {
      ...ctxJson,
      interruptRequestedRunId: runId,
      liveStatus: {
        ...(liveStatus || {}),
        runId,
        canInterrupt: false,
        label: "Stopping after the current step",
        updatedAt: new Date().toISOString(),
      },
    };

    await (prisma as any).portalAiChatThread.update({
      where: { id: threadId },
      data: { contextJson: nextCtx },
    });

    return NextResponse.json({ ok: true, interrupted: true, liveStatus: normalizeThreadLiveStatus(nextCtx.liveStatus) });
  }

  if (action === "duplicate") {
    // Get all messages from the original thread
    const messages = await (prisma as any).portalAiChatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        text: true,
        attachmentsJson: true,
        createdByUserId: true,
      },
    });

    // Create a new thread with same title + "(branch)" suffix
    const branchTitle = `${thread.title || "Chat"} (branch)`.slice(0, 120);
    const newThread = await (prisma as any).portalAiChatThread.create({
      data: {
        ownerId,
        title: branchTitle,
        createdByUserId,
        lastMessageAt: messages.length ? new Date() : null,
        isPinned: false,
        pinnedAt: null,
        contextJson: thread.contextJson, // Copy context
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

    // Copy all messages to new thread
    if (messages.length) {
      await (prisma as any).portalAiChatMessage.createMany({
        data: messages.map((m: any) => ({
          ownerId,
          threadId: newThread.id,
          role: m.role,
          text: m.text,
          attachmentsJson: m.attachmentsJson,
          createdByUserId: m.createdByUserId,
          sendAt: null,
          sentAt: new Date(),
        })),
      });
    }

    return NextResponse.json({ ok: true, newThread });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
