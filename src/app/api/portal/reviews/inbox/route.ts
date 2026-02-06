import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

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

  const reviews = await prisma.portalReview.findMany({
    where: {
      ownerId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      rating: true,
      name: true,
      body: true,
      email: true,
      phone: true,
      photoUrls: true,
      archivedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, reviews });
}
