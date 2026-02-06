import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const json = await req.json().catch(() => null);
  const rec = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;

  const reviewId = typeof rec?.reviewId === "string" ? rec.reviewId.trim() : "";
  const replyRaw = typeof rec?.reply === "string" ? rec.reply : "";
  const reply = replyRaw.trim().slice(0, 2000);

  if (!reviewId) {
    return NextResponse.json({ ok: false, error: "Missing reviewId" }, { status: 400 });
  }

  const [hasReply, hasReplyAt] = await Promise.all([
    hasPublicColumn("PortalReview", "businessReply"),
    hasPublicColumn("PortalReview", "businessReplyAt"),
  ]);
  if (!hasReply) {
    return NextResponse.json({ ok: false, error: "Replies are not enabled in this environment yet." }, { status: 409 });
  }

  const updated = await (prisma as any).portalReview.updateMany({
    where: { id: reviewId, ownerId },
    data: {
      businessReply: reply ? reply : null,
      ...(hasReplyAt ? { businessReplyAt: reply ? new Date() : null } : {}),
    },
  });

  if (!updated?.count) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
