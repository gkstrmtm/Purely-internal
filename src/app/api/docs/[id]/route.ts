import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function canAccessDoc(params: { userId: string; role?: string; docOwnerId: string }) {
  const { userId, role, docOwnerId } = params;
  if (docOwnerId === userId) return true;
  return role === "MANAGER" || role === "ADMIN";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const doc = await prisma.doc.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canAccessDoc({ userId, role, docOwnerId: doc.ownerId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ doc });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const existing = await prisma.doc.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canAccessDoc({ userId, role, docOwnerId: existing.ownerId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { title?: unknown; content?: unknown }
    | null;

  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title : undefined;
  const content = typeof body.content === "string" ? body.content : undefined;

  if (title === undefined && content === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const doc = await prisma.doc.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
  });

  return NextResponse.json({ doc });
}
