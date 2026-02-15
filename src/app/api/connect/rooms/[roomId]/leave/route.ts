import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureConnectSchema } from "@/lib/connectSchema";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const leaveSchema = z.object({
	participantId: z.string().min(1),
	secret: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
	const { roomId } = await ctx.params;
	const json = await req.json().catch(() => null);
	const parsed = leaveSchema.safeParse(json ?? {});
	if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

	try {
		await ensureConnectSchema();

		const me = await prisma.connectParticipant.findFirst({
			where: { id: parsed.data.participantId, secret: parsed.data.secret, roomId },
			select: { id: true },
		});
		if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

		await prisma.connectParticipant.update({
			where: { id: parsed.data.participantId },
			data: { leftAt: new Date() },
		});

		await prisma.connectSignal.create({
			data: {
				roomId,
				fromParticipantId: parsed.data.participantId,
				toParticipantId: null,
				kind: "leave",
				payload: { participantId: parsed.data.participantId },
			},
			select: { id: true },
		});

		return NextResponse.json({ ok: true });
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to leave", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
