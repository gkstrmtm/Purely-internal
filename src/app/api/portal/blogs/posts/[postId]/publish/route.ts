import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireClientSessionForService("blogs");
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
    select: { id: true, archivedAt: true, publishedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.archivedAt) return NextResponse.json({ error: "Post is archived" }, { status: 400 });

  const updated = await prisma.clientBlogPost.update({
    where: { id: existing.id },
    data: {
      status: "PUBLISHED",
      ...(existing.publishedAt ? {} : { publishedAt: new Date() }),
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

  const baseUrl = getAppBaseUrl();
  void tryNotifyPortalAccountUsers({
    ownerId,
    kind: "blog_published",
    subject: `Blog published: ${updated.title || updated.slug || updated.id}`,
    text: [
      "A blog post was published.",
      "",
      updated.title ? `Title: ${updated.title}` : null,
      updated.slug ? `Slug: ${updated.slug}` : null,
      updated.publishedAt ? `Published: ${new Date(updated.publishedAt).toISOString()}` : null,
      "",
      `Open blogs: ${baseUrl}/portal/app/blogs`,
    ]
      .filter(Boolean)
      .join("\n"),
  }).catch(() => null);

  return NextResponse.json({ ok: true, post: updated });
}
