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
			select: { id: true, status: true },
		});
		if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
		if (me.status !== "approved") {
			return NextResponse.json({ ok: true, roomId, pending: true, participants: [] });
		}

		await prisma.connectParticipant.update({
			where: { id: parsed.data.participantId },
			data: { lastSeenAt: new Date() },
		});

		const participants = await prisma.connectParticipant.findMany({
			where: { roomId, leftAt: null, status: "approved" },
			orderBy: { createdAt: "asc" },
			select: { id: true, displayName: true, isGuest: true, createdAt: true },
		});

		return NextResponse.json({ ok: true, roomId, pending: false, participants });
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to load participants", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
