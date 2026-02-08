import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseChannel(v: string | null): "EMAIL" | "SMS" {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "sms" ? "SMS" : "EMAIL";
}

function customerFriendlyError(err: unknown, channel: "EMAIL" | "SMS") {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();

  // Common when migrations haven't been applied yet.
  if (msg.includes("portalinbox") && (msg.includes("does not exist") || msg.includes("relation") || msg.includes("table"))) {
    return {
      status: 503,
      code: "INBOX_NOT_READY",
      error:
        "Your inbox is still being set up. Please refresh in a minute. If this keeps happening, contact support.",
    };
  }

  if (msg.includes("unauthorized") || msg.includes("forbidden")) {
    return {
      status: 401,
      code: "SESSION_EXPIRED",
      error: "Please sign in again to view your inbox.",
    };
  }

  // Generic fallback.
  return {
    status: 500,
    code: "INBOX_LOAD_FAILED",
    error:
      channel === "SMS"
        ? "We couldn’t load your text message threads right now. Please try again in a moment."
        : "We couldn’t load your email threads right now. Please try again in a moment.",
  };
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

  try {
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
  } catch (e) {
    const friendly = customerFriendlyError(e, channel);
    return NextResponse.json({ ok: false, code: friendly.code, error: friendly.error }, { status: friendly.status });
  }
}
