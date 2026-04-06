import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

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
      };
    });

  return NextResponse.json({ ok: true, threads: visible });
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

  const thread = await (prisma as any).portalAiChatThread.create({
    data: {
      ownerId,
      title,
      createdByUserId,
      lastMessageAt: null,
      isPinned: false,
      pinnedAt: null,
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

  return NextResponse.json({ ok: true, thread });
}
