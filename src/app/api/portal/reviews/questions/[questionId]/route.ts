import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(_req: Request, ctx: { params: Promise<{ questionId: string }> }) {
  const auth = await requireClientSessionForService("reviews");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const hasTable = await hasPublicColumn("PortalReviewQuestion", "id");
  if (!hasTable) {
    return NextResponse.json({ ok: false, error: "Q&A is not enabled in this environment yet." }, { status: 409 });
  }

  const ownerId = auth.session.user.id;
  const { questionId } = await ctx.params;

  const existing = await (prisma as any).portalReviewQuestion.findFirst({
    where: { id: questionId, ownerId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await (prisma as any).portalReviewQuestion.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
}