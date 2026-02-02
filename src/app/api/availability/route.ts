import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  startAt: z.string().min(1),
  endAt: z.string().min(1),
});

const replaceRangeSchema = z.object({
  rangeStart: z.string().min(1),
  rangeEnd: z.string().min(1),
  blocks: z
    .array(
      z.object({
        startAt: z.string().min(1),
        endAt: z.string().min(1),
      }),
    )
    .max(500),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocks = await prisma.availabilityBlock.findMany({
    where: { userId },
    orderBy: { startAt: "asc" },
    take: 200,
  });

  return NextResponse.json({ blocks });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "CLOSER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const block = await prisma.availabilityBlock.create({
    data: { userId, startAt, endAt },
  });

  return NextResponse.json({ block });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "CLOSER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = replaceRangeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const rangeStart = new Date(parsed.data.rangeStart);
  const rangeEnd = new Date(parsed.data.rangeEnd);
  if (
    Number.isNaN(rangeStart.getTime()) ||
    Number.isNaN(rangeEnd.getTime()) ||
    rangeEnd <= rangeStart
  ) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const blocks = parsed.data.blocks
    .map((b) => ({ startAt: new Date(b.startAt), endAt: new Date(b.endAt) }))
    .filter((b) => !Number.isNaN(b.startAt.getTime()) && !Number.isNaN(b.endAt.getTime()))
    .filter((b) => b.endAt > b.startAt)
    .filter((b) => b.startAt < rangeEnd && b.endAt > rangeStart)
    .map((b) => ({
      startAt: b.startAt < rangeStart ? rangeStart : b.startAt,
      endAt: b.endAt > rangeEnd ? rangeEnd : b.endAt,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.availabilityBlock.deleteMany({
      where: {
        userId,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
    });

    if (blocks.length > 0) {
      await tx.availabilityBlock.createMany({
        data: blocks.map((b) => ({ userId, startAt: b.startAt, endAt: b.endAt })),
      });
    }
  });

  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "CLOSER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const block = await prisma.availabilityBlock.findUnique({ where: { id: parsed.data.id } });
  if (!block || block.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.availabilityBlock.delete({ where: { id: parsed.data.id } });
  return NextResponse.json({ ok: true });
}
