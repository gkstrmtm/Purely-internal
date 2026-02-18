import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { ensureConnectSchema } from "@/lib/connectSchema";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const joinSchema = z.object({
	displayName: z.string().min(1).max(60).optional(),
});

function safeDisplayName(s: string) {
	return String(s || "")
		.replace(/[\r\n\t]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);
}

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
	const { roomId } = await ctx.params;
	const session = await getServerSession(authOptions);

	const json = await req.json().catch(() => null);
	const parsed = joinSchema.safeParse(json ?? {});
	if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

	const userId = session?.user?.id ?? null;
	const employeeName = safeDisplayName(session?.user?.name ?? "");
	const requestedName = safeDisplayName(parsed.data.displayName ?? "");

	const displayName = employeeName || requestedName;
	if (!displayName) return NextResponse.json({ ok: false, error: "Enter your name" }, { status: 400 });

	try {
		await ensureConnectSchema();

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
		if (room.locked) return NextResponse.json({ ok: false, error: "Room is locked" }, { status: 423 });

		const secret = crypto.randomUUID();

		// First joiner becomes host, regardless of who created the room.
		const isHostJoin = !room.hostParticipantId;
		const pending = !isHostJoin && room.waitingRoomEnabled;

		const result = await prisma.$transaction(async (tx) => {
			const participant = await tx.connectParticipant.create({
				data: {
					roomId: room.id,
					userId,
					displayName,
					isGuest: !userId,
					secret,
					status: pending ? "waiting" : "approved",
					admittedAt: pending ? null : new Date(),
				},
				select: { id: true, displayName: true, isGuest: true, createdAt: true, status: true },
			});

			let hostParticipantId = room.hostParticipantId;
			if (!hostParticipantId) {
				hostParticipantId = participant.id;
				await tx.connectRoom.update({
					where: { id: room.id },
					data: { hostParticipantId },
					select: { id: true },
				});
			}

			return { participant, hostParticipantId };
		});

		const others = pending
			? []
			: await prisma.connectParticipant.findMany({
				where: { roomId: room.id, leftAt: null, status: "approved", NOT: { id: result.participant.id } },
				orderBy: { createdAt: "asc" },
				select: { id: true, displayName: true, isGuest: true, createdAt: true },
			});

		return NextResponse.json({
			ok: true,
			pending,
			room: {
				id: room.id,
				hostParticipantId: result.hostParticipantId,
				settings: {
					waitingRoomEnabled: room.waitingRoomEnabled,
					locked: room.locked,
					muteOnJoin: room.muteOnJoin,
					cameraOffOnJoin: room.cameraOffOnJoin,
					allowScreenShare: room.allowScreenShare,
				},
			},
			participant: { ...result.participant, secret },
			others,
		});
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to join", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
