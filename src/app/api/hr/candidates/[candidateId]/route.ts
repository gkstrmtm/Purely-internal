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

export async function GET(_req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const { candidateId } = await ctx.params;

  try {
    const candidate = await prisma.hrCandidate.findUnique({
      where: { id: candidateId },
      include: {
        screenings: { orderBy: { createdAt: "desc" }, take: 50 },
        interviews: { orderBy: { scheduledAt: "desc" }, take: 50 },
        evaluations: { orderBy: { createdAt: "desc" }, take: 50 },
        followUps: { orderBy: { sendAt: "desc" }, take: 100 },
        invites: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!candidate) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, candidate });
  } catch (err) {
    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ candidateId: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const { candidateId } = await ctx.params;
  const body = await req.json().catch(() => ({} as any));

  const fullName = safeOneLine(body?.fullName).slice(0, 200);
  const email = safeOneLine(body?.email).slice(0, 200) || null;
  const phone = safeOneLine(body?.phone).slice(0, 80) || null;
  const source = safeOneLine(body?.source).slice(0, 120) || null;
  const notes = String(body?.notes ?? "").trim().slice(0, 4000) || null;
  const status = safeOneLine(body?.status).slice(0, 60) || null;

  try {
    const candidate = await prisma.hrCandidate.update({
      where: { id: candidateId },
      data: {
        ...(fullName ? { fullName } : {}),
        email,
        phone,
        source,
        notes,
        ...(status ? { status: status as any } : {}),
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, candidate });
  } catch (err) {
    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
