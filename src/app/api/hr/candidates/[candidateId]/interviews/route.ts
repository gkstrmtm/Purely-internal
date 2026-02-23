import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";
import { createConnectRoom } from "@/lib/connectRoomCreate";
import { baseUrlFromRequest } from "@/lib/leadOutbound";
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
  const scheduledAtIso = safeOneLine(body?.scheduledAt);
  const scheduledAt = new Date(scheduledAtIso);
  if (!scheduledAtIso || Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid scheduledAt" }, { status: 400 });
  }

  try {
    const candidate = await prisma.hrCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true, fullName: true },
    });
    if (!candidate) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const { roomId } = await createConnectRoom({
      title: `Interview: ${candidate.fullName}`,
      createdByUserId: userId,
    });

    const joinUrl = `${baseUrlFromRequest(req)}/connect/${roomId}`;

    const interview = await prisma.hrCandidateInterview.create({
      data: {
        candidateId,
        scheduledAt,
        connectRoomId: roomId,
        meetingJoinUrl: joinUrl,
        createdByUserId: userId,
      },
      select: { id: true, meetingJoinUrl: true, connectRoomId: true },
    });

    return NextResponse.json({ ok: true, interview });
  } catch (err) {
    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
