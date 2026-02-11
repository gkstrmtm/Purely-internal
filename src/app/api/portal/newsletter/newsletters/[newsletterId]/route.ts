import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const updateSchema = z.object({
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

export async function GET(_req: Request, ctx: { params: Promise<{ newsletterId: string }> }) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const { newsletterId } = await ctx.params;

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true, name: true } });
  if (!site?.id) {
    return NextResponse.json({ ok: false, error: "Newsletter site not configured" }, { status: 404 });
  }

  const newsletter = await prisma.clientNewsletter.findFirst({
    where: { id: newsletterId, siteId: site.id },
    select: {
      id: true,
      siteId: true,
      kind: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      smsText: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!newsletter) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    site: { id: site.id, slug: (site as any).slug ?? null, name: site.name },
    newsletter: {
      ...newsletter,
      sentAtIso: newsletter.sentAt ? newsletter.sentAt.toISOString() : null,
      createdAtIso: newsletter.createdAt.toISOString(),
      updatedAtIso: newsletter.updatedAt.toISOString(),
    },
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ newsletterId: string }> }) {
  const auth = await requireClientSessionForService("newsletter", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const { newsletterId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
  if (!site?.id) {
    return NextResponse.json({ ok: false, error: "Newsletter site not configured" }, { status: 404 });
  }

  const current = await prisma.clientNewsletter.findFirst({
    where: { id: newsletterId, siteId: site.id },
    select: { id: true, status: true },
  });

  if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (current.status === "SENT") return NextResponse.json({ ok: false, error: "Already sent" }, { status: 409 });

  const updated = await prisma.clientNewsletter.update({
    where: { id: current.id },
    data: {
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      smsText: parsed.data.smsText ?? null,
    },
    select: { id: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, newsletter: { id: updated.id, updatedAtIso: updated.updatedAt.toISOString() } });
}
