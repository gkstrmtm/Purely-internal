import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(_req: Request, ctx: { params: Promise<{ reviewId: string }> }) {
  const auth = await requireClientSessionForService("reviews");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { reviewId } = await ctx.params;

  const existing = await prisma.portalReview.findFirst({
    where: { id: reviewId, ownerId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await prisma.portalReview.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
}