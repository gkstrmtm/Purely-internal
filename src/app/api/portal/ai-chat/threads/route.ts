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

  // Cleanup: remove empty placeholder threads created by older client behavior.
  // "Empty" means: no messages at all.
  try {
    await (prisma as any).portalAiChatThread.deleteMany({
      where: {
        ownerId,
        isPinned: false,
        lastMessageAt: null,
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
    .map((t: any) => ({
      id: t.id,
      title: t.title,
      lastMessageAt: t.lastMessageAt,
      isPinned: t.isPinned,
      pinnedAt: t.pinnedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

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
