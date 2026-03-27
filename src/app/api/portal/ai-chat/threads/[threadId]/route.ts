import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PatchThreadSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
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

  const body = await req.json().catch(() => null);
  const parsed = PatchThreadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof parsed.data.title === "string") data.title = parsed.data.title.trim();
  if (typeof parsed.data.pinned === "boolean") {
    data.isPinned = parsed.data.pinned;
    data.pinnedAt = parsed.data.pinned ? new Date() : null;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ ok: false, error: "No changes" }, { status: 400 });
  }

  const updated = await (prisma as any).portalAiChatThread.updateMany({
    where: { id: threadId, ownerId },
    data,
  });
  if (!updated?.count) {
    return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
  }

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
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

  const deleted = await (prisma as any).portalAiChatThread.deleteMany({ where: { id: threadId, ownerId } });
  if (!deleted?.count) {
    return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
