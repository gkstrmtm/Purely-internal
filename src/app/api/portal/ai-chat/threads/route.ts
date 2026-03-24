import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;

  const threads = await (prisma as any).portalAiChatThread.findMany({
    where: { ownerId },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, threads });
}

export async function POST(req: Request) {
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
    },
    select: {
      id: true,
      title: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, thread });
}
