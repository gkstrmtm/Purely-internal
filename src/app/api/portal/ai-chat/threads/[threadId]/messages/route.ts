import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AttachmentSchema = z.object({
  id: z.string().trim().min(1).max(200).optional(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  url: z.string().trim().min(1).max(500),
});

const SendMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  url: z.string().trim().optional(),
  sendAtIso: z.string().trim().optional(),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});

function isoToDateMaybe(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ threadId: string }> }) {
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

  const messages = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: {
      id: true,
      role: true,
      text: true,
      attachmentsJson: true,
      createdAt: true,
      sendAt: true,
      sentAt: true,
      createdByUserId: true,
    },
  });

  return NextResponse.json({ ok: true, messages });
}

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
  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, title: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const sendAt = isoToDateMaybe(parsed.data.sendAtIso);
  const now = new Date();
  const isScheduled = Boolean(sendAt && sendAt.getTime() > now.getTime() + 2_000);

  const userMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId,
      threadId,
      role: "user",
      text: parsed.data.text,
      attachmentsJson: parsed.data.attachments ?? null,
      createdByUserId,
      sendAt: isScheduled ? sendAt : null,
      sentAt: isScheduled ? null : now,
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

  const suggestedTitle = parsed.data.text.trim().slice(0, 60);
  const shouldUpdateTitle = String(thread.title || "").trim() === "New chat" && suggestedTitle.length >= 3;

  await (prisma as any).portalAiChatThread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: now,
      ...(shouldUpdateTitle ? { title: suggestedTitle } : null),
    },
  });

  if (isScheduled) {
    return NextResponse.json({ ok: true, scheduled: true, userMessage: userMsg });
  }

  if (!isPortalSupportChatConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AI chat is not configured for this environment." },
      { status: 503 },
    );
  }

  const recentRows = await (prisma as any).portalAiChatMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "desc" },
    take: 13,
    select: { id: true, role: true, text: true },
  });

  const recentMessages = recentRows
    .filter((m: any) => m.id !== userMsg.id)
    .reverse()
    .slice(-12)
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: String(m.text || "").slice(0, 2000),
    }));

  const reply = await runPortalSupportChat({
    message: parsed.data.text,
    url: parsed.data.url,
    recentMessages,
  });

  const assistantMsg = await (prisma as any).portalAiChatMessage.create({
    data: {
      ownerId,
      threadId,
      role: "assistant",
      text: reply,
      attachmentsJson: null,
      createdByUserId: null,
      sendAt: null,
      sentAt: now,
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

  await (prisma as any).portalAiChatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json({ ok: true, scheduled: false, userMessage: userMsg, assistantMessage: assistantMsg });
}
