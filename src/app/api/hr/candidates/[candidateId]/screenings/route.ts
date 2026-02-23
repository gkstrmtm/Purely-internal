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

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizeCapabilities(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;

  const timezone = safeOneLine(obj.timezone).slice(0, 64);
  const availability = safeOneLine(obj.availability).slice(0, 200);
  const experience = safeOneLine(obj.experience).slice(0, 200);

  const communicationRating = clampInt(obj.communicationRating, 1, 5, 4);
  const objectionHandlingRating = clampInt(obj.objectionHandlingRating, 1, 5, 4);
  const coachabilityRating = clampInt(obj.coachabilityRating, 1, 5, 4);

  const out: Record<string, unknown> = {
    ...(timezone ? { timezone } : {}),
    ...(availability ? { availability } : {}),
    ...(experience ? { experience } : {}),
    communicationRating,
    objectionHandlingRating,
    coachabilityRating,
  };

  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const { candidateId } = await ctx.params;
  const userId = auth.session.user.id;

  const body = await req.json().catch(() => ({} as any));
  const decision = safeOneLine(body?.decision);
  const notes = String(body?.notes ?? "").trim().slice(0, 4000) || null;
  const capabilities = sanitizeCapabilities(body?.capabilities);

  if (decision && decision !== "PASS" && decision !== "FAIL" && decision !== "MAYBE") {
    return NextResponse.json({ ok: false, error: "Invalid decision" }, { status: 400 });
  }

  const baseData: any = {
    candidateId,
    decision: (decision || null) as any,
    notes,
    completedAt: new Date(),
    createdByUserId: userId,
  };

  try {
    const screening = await prisma.hrCandidateScreening.create({
      data: capabilities ? { ...baseData, capabilities } : baseData,
      select: { id: true },
    });

    // Basic funnel: if PASS, move candidate forward.
    if (decision === "PASS") {
      await prisma.hrCandidate.update({
        where: { id: candidateId },
        data: { status: "INTERVIEWING" as any },
        select: { id: true },
      });
    }

    if (decision === "FAIL") {
      await prisma.hrCandidate.update({
        where: { id: candidateId },
        data: { status: "REJECTED" as any },
        select: { id: true },
      });
    }

    return NextResponse.json({ ok: true, screening });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (capabilities && msg.includes("capabilities") && msg.toLowerCase().includes("does not exist")) {
      const screening = await prisma.hrCandidateScreening.create({
        data: baseData,
        select: { id: true },
      });

      if (decision === "PASS") {
        await prisma.hrCandidate.update({
          where: { id: candidateId },
          data: { status: "INTERVIEWING" as any },
          select: { id: true },
        });
      }

      if (decision === "FAIL") {
        await prisma.hrCandidate.update({
          where: { id: candidateId },
          data: { status: "REJECTED" as any },
          select: { id: true },
        });
      }

      return NextResponse.json({ ok: true, screening });
    }

    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
