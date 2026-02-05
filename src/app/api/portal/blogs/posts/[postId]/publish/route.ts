import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { postId } = await ctx.params;
  const ownerId = auth.session.user.id;

  const existing = await prisma.clientBlogPost.findFirst({
    where: { id: postId, site: { ownerId } },
    select: { id: true, archivedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.archivedAt) return NextResponse.json({ error: "Post is archived" }, { status: 400 });

  const updated = await prisma.clientBlogPost.update({
    where: { id: existing.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, post: updated });
}
