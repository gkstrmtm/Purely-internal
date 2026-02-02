import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().default(""),
  kind: z.string().min(1).max(64).default("GENERIC"),
  leadId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const doc = await prisma.doc.create({
      data: {
        ownerId: userId,
        title: parsed.data.title,
        content: parsed.data.content,
        kind: parsed.data.kind,
        leadId: parsed.data.leadId,
      },
    });

    return NextResponse.json({ doc });
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002" && parsed.data.leadId) {
      const existing = await prisma.doc.findFirst({
        where: {
          ownerId: userId,
          leadId: parsed.data.leadId,
          kind: parsed.data.kind,
        },
        select: { id: true, title: true, content: true, kind: true },
      });

      if (existing) return NextResponse.json({ doc: existing });
    }

    return NextResponse.json({ error: "Failed to create doc" }, { status: 500 });
  }
}
