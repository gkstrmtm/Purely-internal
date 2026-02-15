import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { ensureConnectSchema } from "@/lib/connectSchema";
import { prisma } from "@/lib/db";
import { baseUrlFromRequest } from "@/lib/leadOutbound";

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
		await ensureConnectSchema();

		const room = await prisma.connectRoom.create({
			data: {
				title: parsed.data.title?.trim() || null,
				createdByUserId: session?.user?.id ?? null,
			},
			select: { id: true },
		});

		const baseUrl = baseUrlFromRequest(req);
		const joinUrl = `${baseUrl}/connect/${encodeURIComponent(room.id)}`;

		return NextResponse.json({ ok: true, roomId: room.id, joinUrl });
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to create room", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
