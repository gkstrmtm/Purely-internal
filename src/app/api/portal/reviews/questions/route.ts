import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const hasTable = await hasPublicColumn("PortalReviewQuestion", "id");
  if (!hasTable) {
    return NextResponse.json({ ok: true, questions: [] });
  }

  const rows = await (prisma as any).portalReviewQuestion.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      question: true,
      answer: true,
      answeredAt: true,
      createdAt: true,
    },
  });

  const questions = (Array.isArray(rows) ? rows : []).map((q: any) => ({
    id: String(q.id),
    name: String(q.name || ""),
    question: String(q.question || ""),
    answer: q.answer ? String(q.answer) : null,
    answeredAt: q.answeredAt ? new Date(q.answeredAt).toISOString() : null,
    createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : new Date().toISOString(),
  }));

  return NextResponse.json({ ok: true, questions });
}
