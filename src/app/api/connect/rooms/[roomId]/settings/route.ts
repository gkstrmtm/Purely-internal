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

const updateSchema = z
  .object({
    participantId: z.string().min(1),
    secret: z.string().min(1),
    waitingRoomEnabled: z.boolean().optional(),
    locked: z.boolean().optional(),
    muteOnJoin: z.boolean().optional(),
    cameraOffOnJoin: z.boolean().optional(),
    allowScreenShare: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.waitingRoomEnabled !== undefined ||
      d.locked !== undefined ||
      d.muteOnJoin !== undefined ||
      d.cameraOffOnJoin !== undefined ||
      d.allowScreenShare !== undefined,
    { message: "No updates provided" },
  );

async function requireParticipant(roomId: string, participantId: string, secret: string) {
  const me = await prisma.connectParticipant.findFirst({
    where: { id: participantId, secret, roomId },
    select: { id: true, status: true },
  });
  return me;
}

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

    const me = await requireParticipant(roomId, parsed.data.participantId, parsed.data.secret);
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const room = await prisma.connectRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        endedAt: true,
        hostParticipantId: true,
        waitingRoomEnabled: true,
        locked: true,
        muteOnJoin: true,
        cameraOffOnJoin: true,
        allowScreenShare: true,
      },
    });
    if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    if (room.endedAt) return NextResponse.json({ ok: false, error: "Room ended" }, { status: 410 });

    const isHost = room.hostParticipantId === parsed.data.participantId;

    return NextResponse.json({
      ok: true,
      room: {
        id: room.id,
        hostParticipantId: room.hostParticipantId,
        settings: {
          waitingRoomEnabled: room.waitingRoomEnabled,
          locked: room.locked,
          muteOnJoin: room.muteOnJoin,
          cameraOffOnJoin: room.cameraOffOnJoin,
          allowScreenShare: room.allowScreenShare,
        },
      },
      me: { id: parsed.data.participantId, isHost, status: me.status },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Failed to load settings", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  try {
    await ensureConnectSchema();

    const me = await requireParticipant(roomId, parsed.data.participantId, parsed.data.secret);
    if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const room = await prisma.connectRoom.findUnique({
      where: { id: roomId },
      select: { id: true, endedAt: true, hostParticipantId: true },
    });
    if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    if (room.endedAt) return NextResponse.json({ ok: false, error: "Room ended" }, { status: 410 });

    if (room.hostParticipantId !== parsed.data.participantId) {
      return NextResponse.json({ ok: false, error: "Only the host can change settings" }, { status: 403 });
    }

    const updated = await prisma.connectRoom.update({
      where: { id: roomId },
      data: {
        waitingRoomEnabled: parsed.data.waitingRoomEnabled,
        locked: parsed.data.locked,
        muteOnJoin: parsed.data.muteOnJoin,
        cameraOffOnJoin: parsed.data.cameraOffOnJoin,
        allowScreenShare: parsed.data.allowScreenShare,
      },
      select: {
        id: true,
        hostParticipantId: true,
        waitingRoomEnabled: true,
        locked: true,
        muteOnJoin: true,
        cameraOffOnJoin: true,
        allowScreenShare: true,
      },
    });

    return NextResponse.json({
      ok: true,
      room: {
        id: updated.id,
        hostParticipantId: updated.hostParticipantId,
        settings: {
          waitingRoomEnabled: updated.waitingRoomEnabled,
          locked: updated.locked,
          muteOnJoin: updated.muteOnJoin,
          cameraOffOnJoin: updated.cameraOffOnJoin,
          allowScreenShare: updated.allowScreenShare,
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Failed to update settings", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
