import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureConnectSchema } from "@/lib/connectSchema";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const schema = z.object({
  participantId: z.string().min(1),
  secret: z.string().min(1),
  targetParticipantId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  try {
    await ensureConnectSchema();

    const me = await prisma.connectParticipant.findFirst({
      where: { id: parsed.data.participantId, secret: parsed.data.secret, roomId },
      select: { id: true },
    });
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const room = await prisma.connectRoom.findUnique({
      where: { id: roomId },
      select: { id: true, endedAt: true, hostParticipantId: true },
    });
    if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    if (room.endedAt) return NextResponse.json({ ok: false, error: "Room ended" }, { status: 410 });

    if (room.hostParticipantId !== parsed.data.participantId) {
      return NextResponse.json({ ok: false, error: "Only the host can deny participants" }, { status: 403 });
    }

    const updated = await prisma.connectParticipant.updateMany({
      where: { id: parsed.data.targetParticipantId, roomId, leftAt: null, status: "waiting" },
      data: { status: "denied", deniedAt: new Date(), leftAt: new Date() },
    });
    if (!updated.count) return NextResponse.json({ ok: false, error: "Participant is not waiting" }, { status: 409 });

    await prisma.connectSignal.create({
      data: {
        roomId,
        fromParticipantId: parsed.data.participantId,
        toParticipantId: parsed.data.targetParticipantId,
        kind: "deny",
        payload: { participantId: parsed.data.targetParticipantId },
      },
      select: { seq: true },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Failed to deny participant", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
