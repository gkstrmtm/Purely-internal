import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ funnelId: string; pageId: string }> },
) {
  const auth = await requireFunnelBuilderSession();
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
    select: { id: true, draftHtml: true, customHtml: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // If there's no draft, nothing to publish.
  const draft = page.draftHtml.trim();
  if (!draft) {
    return NextResponse.json({ ok: false, error: "No draft to publish" }, { status: 400 });
  }

  const updated = await prisma.creditFunnelPage.update({
    where: { id: pageId },
    data: {
      customHtml: draft,
      draftHtml: "",
    },
    select: {
      id: true,
      slug: true,
      title: true,
      sortOrder: true,
      contentMarkdown: true,
      editorMode: true,
      blocksJson: true,
      customHtml: true,
      draftHtml: true,
      customChatJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, page: updated });
}
