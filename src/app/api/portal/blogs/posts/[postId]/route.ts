import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const updateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(120),
  excerpt: z.string().max(6000),
  content: z.string().max(200000),
  seoKeywords: z.array(z.string().trim().min(1)).max(50).optional(),
  archived: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { postId } = await ctx.params;
  const ownerId = auth.session.user.id;

  const post = await prisma.clientBlogPost.findFirst({
    where: {
      id: postId,
      site: { ownerId },
    },
    select: {
      id: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      seoKeywords: true,
      publishedAt: true,
      archivedAt: true,
      updatedAt: true,
    },
  });

  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, post });
}

async function uniqueSlug(siteId: string, desired: string, currentId: string) {
  const base = slugify(desired) || "post";
  let attempt = base;
  for (let i = 0; i < 50; i += 1) {
    const exists = await prisma.clientBlogPost.findUnique({
      where: { siteId_slug: { siteId, slug: attempt } },
      select: { id: true },
    });
    if (!exists || exists.id === currentId) return attempt;
    attempt = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

export async function PUT(req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { postId } = await ctx.params;
  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.clientBlogPost.findFirst({
    where: { id: postId, site: { ownerId } },
    select: { id: true, siteId: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const slug = await uniqueSlug(existing.siteId, parsed.data.slug, existing.id);

  const updated = await prisma.clientBlogPost.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title.trim(),
      slug,
      excerpt: parsed.data.excerpt ?? "",
      content: parsed.data.content ?? "",
      seoKeywords: parsed.data.seoKeywords?.length ? parsed.data.seoKeywords : Prisma.DbNull,
      archivedAt: parsed.data.archived ? new Date() : null,
    },
    select: {
      id: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      seoKeywords: true,
      publishedAt: true,
      archivedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, post: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ postId: string }> }) {
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
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.clientBlogPost.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true });
}
