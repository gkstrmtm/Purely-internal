import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { postId } = await ctx.params;
  const ownerId = auth.session.user.id;

  const post = await prisma.clientBlogPost.findFirst({
    where: { id: postId, site: { ownerId } },
    select: { title: true, slug: true, excerpt: true, content: true },
  });

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const md = `# ${post.title}\n\n${post.excerpt ? post.excerpt + "\n\n" : ""}${post.content || ""}\n`;

  return new NextResponse(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename=\"${post.slug || "post"}.md\"`,
      "cache-control": "no-store, max-age=0",
    },
  });
}
