import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { threadId } = await params;

  const thread = await (prisma as any).portalInboxThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const takeRaw = Number(url.searchParams.get("take") ?? "120");
  const take = Number.isFinite(takeRaw) ? Math.max(10, Math.min(500, takeRaw)) : 120;

  const messages = await (prisma as any).portalInboxMessage.findMany({
    where: { ownerId, threadId },
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      channel: true,
      direction: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      bodyText: true,
      provider: true,
      providerMessageId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, messages });
}
