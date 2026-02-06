import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  reviewId: z.string().min(1),
  archived: z.boolean(),
});

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const review = await prisma.portalReview.findUnique({
    where: { id: parsed.data.reviewId },
    select: { id: true, ownerId: true },
  });
  if (!review || review.ownerId !== ownerId) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await prisma.portalReview.update({
    where: { id: review.id },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
