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
  const channel = safeOneLine(body?.channel);
  const toAddress = safeOneLine(body?.toAddress).slice(0, 200);
  const subject = safeOneLine(body?.subject).slice(0, 200) || null;
  const bodyText = String(body?.bodyText ?? "").trim();
  const sendAtIso = safeOneLine(body?.sendAt);

  if (channel !== "EMAIL" && channel !== "SMS") {
    return NextResponse.json({ ok: false, error: "Invalid channel" }, { status: 400 });
  }
  if (!toAddress) return NextResponse.json({ ok: false, error: "Missing toAddress" }, { status: 400 });
  if (!bodyText) return NextResponse.json({ ok: false, error: "Missing bodyText" }, { status: 400 });

  const sendAt = sendAtIso ? new Date(sendAtIso) : new Date(Date.now() + 5 * 60 * 1000);
  if (Number.isNaN(sendAt.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid sendAt" }, { status: 400 });
  }

  try {
    const followUp = await prisma.hrCandidateFollowUp.create({
      data: {
        candidateId,
        channel: channel as any,
        toAddress,
        subject,
        bodyText: bodyText.slice(0, 6000),
        sendAt,
        createdByUserId: userId,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, followUp });
  } catch (err) {
    if (isHrSchemaMissingError(err)) return NextResponse.json(hrSchemaMissingResponse(), { status: 503 });
    throw err;
  }
}
