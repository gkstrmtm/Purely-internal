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
			select: { id: true, endedAt: true },
		});
		if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
		if (room.endedAt) return NextResponse.json({ ok: false, error: "Room ended" }, { status: 410 });

		const secret = crypto.randomUUID();
		const participant = await prisma.connectParticipant.create({
			data: {
				roomId: room.id,
				userId,
				displayName,
				isGuest: !userId,
				secret,
			},
			select: { id: true, displayName: true, isGuest: true, createdAt: true },
		});

		const others = await prisma.connectParticipant.findMany({
			where: { roomId: room.id, leftAt: null, NOT: { id: participant.id } },
			orderBy: { createdAt: "asc" },
			select: { id: true, displayName: true, isGuest: true, createdAt: true },
		});

		return NextResponse.json({
			ok: true,
			room: { id: room.id },
			participant: { ...participant, secret },
			others,
		});
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to join", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
