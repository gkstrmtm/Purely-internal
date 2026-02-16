import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { baseUrlFromRequest } from "@/lib/leadOutbound";
import { createConnectRoom } from "@/lib/connectRoomCreate";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const createRoomSchema = z.object({
	title: z.string().max(80).optional(),
});

export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	const json = await req.json().catch(() => null);
	const parsed = createRoomSchema.safeParse(json ?? {});
	if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

	try {
		const room = await createConnectRoom({
			title: parsed.data.title?.trim() || null,
			createdByUserId: session?.user?.id ?? null,
			idLength: 5,
			maxAttempts: 12,
		});

		const baseUrl = baseUrlFromRequest(req);
		const joinUrl = `${baseUrl}/connect/${encodeURIComponent(room.roomId)}`;

		return NextResponse.json({ ok: true, roomId: room.roomId, joinUrl });
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to create room", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
