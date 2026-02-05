import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { slugify } from "@/lib/slugify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const createSchema = z.object({
  title: z.string().trim().max(180).optional(),
});

const listSchema = z.object({
  take: z.string().optional(),
  includeArchived: z.string().optional(),
});

async function requireSiteId(ownerId: string) {
  const site = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { id: true },
  });
  return site?.id ?? null;
}

async function uniqueSlug(siteId: string, title: string) {
  const base = slugify(title) || "post";
  let attempt = base;
  for (let i = 0; i < 50; i += 1) {
    const exists = await prisma.clientBlogPost.findUnique({
      where: { siteId_slug: { siteId, slug: attempt } },
      select: { id: true },
    });
    if (!exists) return attempt;
    attempt = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const siteId = await requireSiteId(ownerId);
  if (!siteId) return NextResponse.json({ ok: true, posts: [] });

  const url = new URL(req.url);
  const parsed = listSchema.safeParse({
    take: url.searchParams.get("take") ?? undefined,
    includeArchived: url.searchParams.get("includeArchived") ?? undefined,
  });

  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const take = parsed.data.take ? Math.min(200, Math.max(1, Number.parseInt(parsed.data.take, 10) || 50)) : 50;
  const includeArchived = parsed.data.includeArchived === "1" || parsed.data.includeArchived === "true";

  const posts = await prisma.clientBlogPost.findMany({
    where: {
      siteId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ updatedAt: "desc" }],
    take,
    select: {
      id: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      publishedAt: true,
      archivedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, posts });
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const siteId = await requireSiteId(ownerId);
  if (!siteId) return NextResponse.json({ error: "Create your blog site first" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const title = parsed.data.title?.trim() || "Untitled post";
  const slug = await uniqueSlug(siteId, title);

  const created = await prisma.clientBlogPost.create({
    data: {
      siteId,
      status: "DRAFT",
      slug,
      title,
      excerpt: "",
      content: "",
    },
    select: {
      id: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      publishedAt: true,
      archivedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, post: created });
}
