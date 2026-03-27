import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { listPortalAccountMembers } from "@/lib/portalAccounts";
import {
  getSharedWithUserIdsFromThreadContext,
  isPortalAiChatThreadOwner,
  setSharedWithUserIdsInThreadContext,
} from "@/lib/portalAiChatSharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SharePostSchema = z
  .object({
    userIds: z.array(z.string().trim().min(1).max(120)).max(100),
  })
  .strict();

async function listShareableUsers(ownerId: string) {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, name: true, active: true } });
  const members = await listPortalAccountMembers(ownerId).catch(() => [] as any[]);

  const out: Array<{ userId: string; email: string; name: string }> = [];
  if (owner && owner.active !== false) {
    out.push({ userId: owner.id, email: owner.email, name: owner.name || owner.email });
  }

  for (const m of Array.isArray(members) ? members : []) {
    const userId = String(m?.userId || "").trim();
    const email = String(m?.user?.email || "").trim();
    const name = String(m?.user?.name || "").trim() || email;
    const active = Boolean(m?.user?.active ?? true);
    if (!userId || !email || !active) continue;
    if (out.some((x) => x.userId === userId)) continue;
    out.push({ userId, email, name });
  }

  return out.slice(0, 500);
}

export async function GET(_req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { threadId } = await ctx.params;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Only the thread owner can manage sharing.
  if (!isPortalAiChatThreadOwner({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const members = await listShareableUsers(ownerId);
  const allowedIds = new Set(members.map((m) => m.userId));

  const creatorUserId = String(thread.createdByUserId || ownerId);

  const sharedWithUserIds = getSharedWithUserIdsFromThreadContext(thread.contextJson)
    .filter((id) => allowedIds.has(id))
    .filter((id) => id !== creatorUserId);

  return NextResponse.json({ ok: true, threadId: String(thread.id), creatorUserId, members, sharedWithUserIds });
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { threadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = SharePostSchema.safeParse(body ?? null);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true, contextJson: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!isPortalAiChatThreadOwner({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const members = await listShareableUsers(ownerId);
  const allowedIds = new Set(members.map((m) => m.userId));

  const creator = String(thread.createdByUserId || ownerId);
  const nextIds = Array.from(new Set(parsed.data.userIds.map((s) => s.trim()).filter(Boolean)))
    .filter((id) => allowedIds.has(id))
    .filter((id) => id !== creator)
    .slice(0, 100);

  const nextCtx = setSharedWithUserIdsInThreadContext(thread.contextJson, nextIds);

  await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });

  return NextResponse.json({ ok: true, threadId: String(thread.id), sharedWithUserIds: nextIds });
}
