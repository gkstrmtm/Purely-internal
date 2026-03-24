import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const { threadId } = await ctx.params;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!isPortalSupportChatConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AI chat is not configured for this environment." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : undefined;

  const now = new Date();
  const pending = await (prisma as any).portalAiChatMessage.findMany({
    where: {
      ownerId,
      threadId,
      role: "user",
      sentAt: null,
      sendAt: { lte: now },
    },
    orderBy: { sendAt: "asc" },
    take: 10,
    select: { id: true, text: true },
  });

  const created: any[] = [];

  for (const p of pending) {
    // Mark as sent first to avoid double-processing.
    await (prisma as any).portalAiChatMessage.update({
      where: { id: p.id },
      data: { sentAt: new Date() },
    });

    const recentRows = await (prisma as any).portalAiChatMessage.findMany({
      where: { ownerId, threadId },
      orderBy: { createdAt: "desc" },
      take: 13,
      select: { id: true, role: true, text: true },
    });

    const recentMessages = recentRows
      .filter((m: any) => m.id !== p.id)
      .reverse()
      .slice(-12)
      .map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        text: String(m.text || "").slice(0, 2000),
      }));

    const reply = await runPortalSupportChat({ message: String(p.text || ""), url, recentMessages });

    const assistantMsg = await (prisma as any).portalAiChatMessage.create({
      data: {
        ownerId,
        threadId,
        role: "assistant",
        text: reply,
        attachmentsJson: null,
        createdByUserId: null,
        sendAt: null,
        sentAt: new Date(),
      },
      select: {
        id: true,
        role: true,
        text: true,
        attachmentsJson: true,
        createdAt: true,
        sendAt: true,
        sentAt: true,
      },
    });

    created.push(assistantMsg);
  }

  await (prisma as any).portalAiChatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: created.length ? new Date() : undefined },
  });

  return NextResponse.json({ ok: true, processed: pending.length, assistantMessages: created });
}
