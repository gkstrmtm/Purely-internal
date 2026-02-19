import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  if (!funnelId) return NextResponse.json({ ok: false, error: "Invalid funnelId" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const pages = await prisma.creditFunnelPage.findMany({
    where: { funnelId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      sortOrder: true,
      contentMarkdown: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, pages });
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  if (!funnelId) return NextResponse.json({ ok: false, error: "Invalid funnelId" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as any;
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown : "";
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;

  const normalizedSlug = slug
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  if (!normalizedSlug) {
    return NextResponse.json({ ok: false, error: "Slug is required" }, { status: 400 });
  }

  const page = await prisma.creditFunnelPage.create({
    data: {
      funnelId,
      slug: normalizedSlug,
      title: title || normalizedSlug,
      contentMarkdown,
      sortOrder,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      sortOrder: true,
      contentMarkdown: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, page });
}
