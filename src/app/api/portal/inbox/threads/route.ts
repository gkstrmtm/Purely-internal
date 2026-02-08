import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseChannel(v: string | null): "EMAIL" | "SMS" {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "sms" ? "SMS" : "EMAIL";
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const channel = parseChannel(url.searchParams.get("channel"));

  const threads = await (prisma as any).portalInboxThread.findMany({
    where: { ownerId, channel },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    select: {
      id: true,
      channel: true,
      peerAddress: true,
      subject: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      lastMessageDirection: true,
      lastMessageFrom: true,
      lastMessageTo: true,
      lastMessageSubject: true,
    },
  });

  return NextResponse.json({ ok: true, threads });
}
