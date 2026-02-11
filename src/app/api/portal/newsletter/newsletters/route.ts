import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { uniqueNewsletterSlug } from "@/lib/portalNewsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Kind = "EXTERNAL" | "INTERNAL";

function clampKind(raw: string | null): Kind {
  return (raw || "").toLowerCase().trim() === "internal" ? "INTERNAL" : "EXTERNAL";
}

function clampTake(raw: string | null) {
  const n = Math.floor(Number(raw || 50) || 50);
  return Math.max(1, Math.min(200, n));
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const kind = clampKind(url.searchParams.get("kind"));
  const take = clampTake(url.searchParams.get("take"));

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true } });
  if (!site?.id) {
    return NextResponse.json({ ok: true, site: null, newsletters: [] });
  }

  const newsletters = await prisma.clientNewsletter.findMany({
    where: { siteId: site.id, kind },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    site: { id: site.id, slug: (site as any).slug ?? null },
    newsletters: newsletters.map((n) => ({
      id: n.id,
      kind: n.kind,
      status: n.status,
      slug: n.slug,
      title: n.title,
      excerpt: n.excerpt,
      sentAtIso: n.sentAt ? n.sentAt.toISOString() : null,
      createdAtIso: n.createdAt.toISOString(),
      updatedAtIso: n.updatedAt.toISOString(),
    })),
  });
}

const postSchema = z.object({
  kind: z.enum(["external", "internal"]),
  status: z.enum(["DRAFT", "READY"]).optional(),
  title: z.string().trim().min(1).max(180),
  excerpt: z.string().trim().max(6000),
  content: z.string().trim().max(200000),
  smsText: z
    .string()
    .trim()
    .max(240)
    .optional()
    .nullable()
    .transform((v) => {
      if (v === undefined) return null;
      if (v === null) return null;
      const t = String(v).trim();
      return t ? t : null;
    }),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("newsletter", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
  if (!site?.id) {
    return NextResponse.json({ ok: false, error: "Newsletter site not configured" }, { status: 404 });
  }

  const kind = parsed.data.kind === "internal" ? "INTERNAL" : "EXTERNAL";
  const slug = await uniqueNewsletterSlug(site.id, kind, parsed.data.title);
  const status = parsed.data.status ?? "DRAFT";

  const created = await prisma.clientNewsletter.create({
    data: {
      siteId: site.id,
      kind,
      status,
      slug,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      smsText: parsed.data.smsText ?? null,
    },
    select: { id: true, slug: true, status: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    newsletter: {
      id: created.id,
      slug: created.slug,
      status: created.status,
      createdAtIso: created.createdAt.toISOString(),
    },
  });
}
