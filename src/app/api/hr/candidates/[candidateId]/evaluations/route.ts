import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";
import { hrSchemaMissingResponse, isHrSchemaMissingError } from "@/lib/hrDbCompat";

function safeOneLine(s: unknown) {
  return String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const { candidateId } = await ctx.params;
  const userId = auth.session.user.id;

  const body = await req.json().catch(() => ({} as any));
  const decision = safeOneLine(body?.decision);
  const ratingOverall = typeof body?.ratingOverall === "number" ? body.ratingOverall : Number(body?.ratingOverall || "");
  const notes = String(body?.notes ?? "").trim().slice(0, 6000) || null;

  if (decision && decision !== "HIRE" && decision !== "NO_HIRE" && decision !== "HOLD") {
    return NextResponse.json({ ok: false, error: "Invalid decision" }, { status: 400 });
  }

  const rating = Number.isFinite(ratingOverall) ? Math.max(1, Math.min(5, Math.round(ratingOverall))) : null;

  try {
    const evalRow = await prisma.hrCandidateEvaluation.create({
      data: {
        candidateId,
        decision: (decision || null) as any,
        ratingOverall: rating,
        notes,
        createdByUserId: userId,
      },
      select: { id: true },
    });

    if (decision === "HIRE") {
      await prisma.hrCandidate.update({
        where: { id: candidateId },
        data: { status: "OFFERED" as any },
        select: { id: true },
      });
    }

    if (decision === "NO_HIRE") {
      await prisma.hrCandidate.update({
        where: { id: candidateId },
        data: { status: "REJECTED" as any },
        select: { id: true },
      });
    }

    return NextResponse.json({ ok: true, evaluation: evalRow });
  } catch (err) {
    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
