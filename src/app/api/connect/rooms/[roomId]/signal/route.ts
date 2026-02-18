import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureConnectSchema } from "@/lib/connectSchema";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const postSchema = z.object({
	participantId: z.string().min(1),
	secret: z.string().min(1),
	toParticipantId: z.string().min(1).optional(),
	kind: z.string().min(1).max(30),
	payload: z.unknown(),
});

const pollSchema = z.object({
	participantId: z.string().min(1),
	secret: z.string().min(1),
	afterSeq: z.coerce.number().int().min(0).default(0),
	limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function requireParticipant(opts: { roomId: string; participantId: string; secret: string }) {
	const participant = await prisma.connectParticipant.findFirst({
		where: { id: opts.participantId, secret: opts.secret, roomId: opts.roomId },
		select: { id: true, roomId: true, status: true },
	});
	return participant;
}

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
	const { roomId } = await ctx.params;
	const json = await req.json().catch(() => null);
	const parsed = postSchema.safeParse(json ?? {});
	if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

	try {
		await ensureConnectSchema();

		const me = await requireParticipant({ roomId, participantId: parsed.data.participantId, secret: parsed.data.secret });
		if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
		if (me.status !== "approved") return NextResponse.json({ ok: false, error: "Waiting for host approval" }, { status: 403 });

		const signal = await prisma.connectSignal.create({
			data: {
				roomId,
				fromParticipantId: parsed.data.participantId,
				toParticipantId: parsed.data.toParticipantId ?? null,
				kind: parsed.data.kind,
				payload: parsed.data.payload as never,
			},
			select: { seq: true },
		});

		return NextResponse.json({ ok: true, seq: signal.seq });
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to send signal", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
	const { roomId } = await ctx.params;
	const url = new URL(req.url);
	const parsed = pollSchema.safeParse({
		participantId: url.searchParams.get("participantId") ?? "",
		secret: url.searchParams.get("secret") ?? "",
		afterSeq: url.searchParams.get("afterSeq") ?? "0",
		limit: url.searchParams.get("limit") ?? "50",
	});
	if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

	try {
		await ensureConnectSchema();

		const me = await requireParticipant({ roomId, participantId: parsed.data.participantId, secret: parsed.data.secret });
		if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

		await prisma.connectParticipant.update({
			where: { id: parsed.data.participantId },
			data: { lastSeenAt: new Date() },
		});

		const signals = await prisma.connectSignal.findMany({
			where: {
				roomId,
				seq: { gt: parsed.data.afterSeq },
				fromParticipantId: { not: parsed.data.participantId },
				OR: [{ toParticipantId: null }, { toParticipantId: parsed.data.participantId }],
			},
			orderBy: { seq: "asc" },
			take: parsed.data.limit,
			select: {
				seq: true,
				kind: true,
				payload: true,
				fromParticipantId: true,
				toParticipantId: true,
				createdAt: true,
			},
		});

		const nextAfterSeq = signals.length ? signals[signals.length - 1]!.seq : parsed.data.afterSeq;
		return NextResponse.json({ ok: true, signals, nextAfterSeq });
	} catch (e) {
		return NextResponse.json(
			{ ok: false, error: "Failed to poll signals", details: e instanceof Error ? e.message : "Unknown error" },
			{ status: 500 },
		);
	}
}
