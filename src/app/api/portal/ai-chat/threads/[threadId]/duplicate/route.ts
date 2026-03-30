import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { isPortalAiChatThreadOwner } from "@/lib/portalAiChatSharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DuplicateThreadSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

function safeCopyTitle(original: string): string {
  const base = String(original || "").trim() || "Chat";
  const prefix = base.toLowerCase().startsWith("copy of ") ? "" : "Copy of ";
  const title = `${prefix}${base}`.trim();
  return title.length > 120 ? title.slice(0, 120).trim() : title;
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { threadId } = await ctx.params;
  if (!threadId) return NextResponse.json({ ok: false, error: "Invalid thread" }, { status: 400 });

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const createdByUserId = auth.session.user.memberId || ownerId;
  const memberId = createdByUserId;

  const body = await req.json().catch(() => null);
  const parsed = DuplicateThreadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const src = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: {
      id: true,
      title: true,
      contextJson: true,
      ownerId: true,
      createdByUserId: true,
    },
  });
  if (!src) {
    return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
  }

  if (!isPortalAiChatThreadOwner({ thread: src, memberId })) {
    return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
  }

  const srcMessages = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
    select: {
      role: true,
      text: true,
      attachmentsJson: true,
      createdByUserId: true,
      sendAt: true,
      sentAt: true,
      createdAt: true,
    },
  });

  const now = new Date();
  const title = parsed.data.title?.trim() || safeCopyTitle(src.title || "Chat");

  const thread = await (prisma as any).portalAiChatThread.create({
    data: {
      ownerId,
      title,
      createdByUserId,
      lastMessageAt: now,
      isPinned: false,
      pinnedAt: null,
      forkedFromThreadId: src.id,
      contextJson: src.contextJson ?? null,
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

  if (Array.isArray(srcMessages) && srcMessages.length) {
    await (prisma as any).portalAiChatMessage.createMany({
      data: srcMessages.map((m: any) => ({
        ownerId,
        threadId: thread.id,
        role: String(m.role || ""),
        text: String(m.text || ""),
        attachmentsJson: m.attachmentsJson ?? null,
        createdByUserId: m.createdByUserId ?? null,
        sendAt: m.sendAt ?? null,
        sentAt: m.sentAt ?? null,
        createdAt: m.createdAt ?? now,
      })),
    });
  }

  return NextResponse.json({ ok: true, thread });
}
