import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  archived: z.boolean(),
});

export async function POST(req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { postId } = await ctx.params;
  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.clientBlogPost.findFirst({
    where: { id: postId, site: { ownerId } },
    select: { id: true, archivedAt: true },
  });

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.clientBlogPost.update({
    where: { id: existing.id },
    data: {
      archivedAt: parsed.data.archived ? new Date() : null,
    },
    select: {
      id: true,
      archivedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, post: updated });
}
