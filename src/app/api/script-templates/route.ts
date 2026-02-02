import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "DIALER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.script.findMany({
    where: { ownerId: userId, isTemplate: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "DIALER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const template = await prisma.script.create({
    data: {
      ownerId: userId,
      title: parsed.data.title,
      content: parsed.data.content,
      isTemplate: true,
    },
  });

  return NextResponse.json({ template });
}
