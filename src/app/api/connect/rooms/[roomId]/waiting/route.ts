import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureConnectSchema } from "@/lib/connectSchema";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const querySchema = z.object({
  participantId: z.string().min(1),
  secret: z.string().min(1),
});

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    participantId: url.searchParams.get("participantId") ?? "",
    secret: url.searchParams.get("secret") ?? "",
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

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
      return NextResponse.json({ ok: false, error: "Only the host can view the waiting room" }, { status: 403 });
    }

    const waiting = await prisma.connectParticipant.findMany({
      where: { roomId, leftAt: null, status: "waiting" },
      orderBy: { createdAt: "asc" },
      select: { id: true, displayName: true, isGuest: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, roomId, waiting });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Failed to load waiting room", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
