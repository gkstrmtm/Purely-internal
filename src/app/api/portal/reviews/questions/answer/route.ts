import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("reviews");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const json = await req.json().catch(() => null);
  const rec = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;

  const id = typeof rec?.id === "string" ? rec.id.trim() : "";
  const answerRaw = typeof rec?.answer === "string" ? rec.answer : "";
  const answer = answerRaw.trim().slice(0, 2000);

  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const hasTable = await hasPublicColumn("PortalReviewQuestion", "id");
  if (!hasTable) {
    return NextResponse.json({ ok: false, error: "Q&A is not enabled in this environment yet." }, { status: 409 });
  }

  const updated = await (prisma as any).portalReviewQuestion.updateMany({
    where: { id, ownerId },
    data: {
      answer: answer ? answer : null,
      answeredAt: answer ? new Date() : null,
    },
  });

  if (!updated?.count) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
