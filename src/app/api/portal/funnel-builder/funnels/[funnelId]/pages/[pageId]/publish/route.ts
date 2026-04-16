import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtml,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { createFunnelPagePublishUpdate } from "@/lib/funnelPageState";

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

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: withDraftHtmlSelect({ id: true, customHtml: true }, hasDraftHtml),
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const normalizedPage = normalizeDraftHtml(page);
  if (!hasDraftHtml) {
    return NextResponse.json({ ok: true, page: normalizedPage });
  }

  const publishUpdate = createFunnelPagePublishUpdate(normalizedPage);
  if (!publishUpdate) {
    return NextResponse.json({ ok: false, error: "No draft to publish" }, { status: 400 });
  }

  const updated = await prisma.creditFunnelPage.update({
    where: { id: pageId },
    data: publishUpdate,
    select: withDraftHtmlSelect({
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
    }, hasDraftHtml),
  });

  return NextResponse.json({ ok: true, page: normalizeDraftHtml(updated) });
}
