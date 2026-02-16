import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import crypto from "crypto";
import { Prisma } from "@prisma/client";

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

function generateRoomId(len = 5) {
	// URL-safe, lowercase, avoids ambiguous chars (0/O/1/I/l).
	const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
	const bytes = crypto.randomBytes(len);
	let out = "";
	for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
	return out;
}

export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	const json = await req.json().catch(() => null);
	const parsed = createRoomSchema.safeParse(json ?? {});
	if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

	try {
		await ensureConnectSchema();

		let room: { id: string } | null = null;
		for (let attempt = 0; attempt < 12; attempt++) {
			const id = generateRoomId(5);
			try {
				room = await prisma.connectRoom.create({
					data: {
						id,
						title: parsed.data.title?.trim() || null,
						createdByUserId: session?.user?.id ?? null,
					},
					select: { id: true },
				});
				break;
			} catch (e) {
				if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
				throw e;
			}
		}
		if (!room) throw new Error("Failed to allocate room id");

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
