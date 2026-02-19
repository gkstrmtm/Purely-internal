import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: { id: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as any;

  const data: any = {};
  if (typeof body?.title === "string") data.title = body.title.trim();
  if (typeof body?.contentMarkdown === "string") data.contentMarkdown = body.contentMarkdown;
  if (typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)) data.sortOrder = body.sortOrder;

  if (typeof body?.editorMode === "string") {
    const m = body.editorMode.trim().toUpperCase();
    if (m !== "MARKDOWN" && m !== "BLOCKS" && m !== "CUSTOM_HTML") {
      return NextResponse.json({ ok: false, error: "Invalid editorMode" }, { status: 400 });
    }
    data.editorMode = m;
  }
  if (typeof body?.customHtml === "string") data.customHtml = body.customHtml;
  if (body?.blocksJson !== undefined) data.blocksJson = body.blocksJson;
  if (body?.customChatJson !== undefined) data.customChatJson = body.customChatJson;

  if (typeof body?.slug === "string") {
    const slug = body.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
    if (!slug) return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
    data.slug = slug;
  }

  const updated = await prisma.creditFunnelPage.update({
    where: { id: pageId },
    data,
    select: {
      id: true,
      slug: true,
      title: true,
      sortOrder: true,
      contentMarkdown: true,
      editorMode: true,
      blocksJson: true,
      customHtml: true,
      customChatJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, page: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: { id: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await prisma.creditFunnelPage.delete({ where: { id: pageId } });
  return NextResponse.json({ ok: true });
}
