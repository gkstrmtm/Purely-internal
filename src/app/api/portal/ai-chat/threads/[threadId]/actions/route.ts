import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ActionSchema = z.object({
  action: z.enum(["pin", "unpin", "delete", "duplicate"]),
});

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
  const createdByUserId = auth.session.user.memberId || ownerId;
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
    select: { id: true, title: true, contextJson: true },
  });
  if (!thread) {
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
      where: { threadId },
    });
    await (prisma as any).portalAiChatThread.delete({
      where: { id: threadId },
    });
    return NextResponse.json({ ok: true });
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
