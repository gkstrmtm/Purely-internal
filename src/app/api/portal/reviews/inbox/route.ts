import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  const ownerId = auth.session.user.id;

  const [hasBusinessReply, hasBusinessReplyAt] = await Promise.all([
    hasPublicColumn("PortalReview", "businessReply"),
    hasPublicColumn("PortalReview", "businessReplyAt"),
  ]);

  const select: any = {
    id: true,
    rating: true,
    name: true,
    body: true,
    email: true,
    phone: true,
    photoUrls: true,
    archivedAt: true,
    createdAt: true,
  };
  if (hasBusinessReply) select.businessReply = true;
  if (hasBusinessReplyAt) select.businessReplyAt = true;

  const reviews = await (prisma as any).portalReview.findMany({
    where: {
      ownerId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select,
  });

  return NextResponse.json({ ok: true, reviews });
}
