import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { normalizePortalAiChatRunRecord } from "@/lib/portalAiChatRunLedger";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
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
  const { threadId } = await ctx.params;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
  });
  if (!thread || !canAccessPortalAiChatThread({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const rows = await (prisma as any).portalAiChatRun.findMany({
    where: { ownerId, threadId },
    orderBy: [{ createdAt: "desc" }],
    take: 40,
    select: {
      id: true,
      runId: true,
      triggerKind: true,
      status: true,
      workTitle: true,
      canvasUrl: true,
      summaryText: true,
      assistantMessageId: true,
      scheduledMessageId: true,
      createdAt: true,
      completedAt: true,
      interruptedAt: true,
      stepsJson: true,
      followUpSuggestionsJson: true,
    },
  }).catch(() => []);

  return NextResponse.json({
    ok: true,
    runs: rows.map((row: any) => normalizePortalAiChatRunRecord(row)).filter(Boolean),
  });
}
