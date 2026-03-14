import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  blocksJson: z.unknown().optional(),
  title: z.string().trim().max(200).optional(),
  setEditorMode: z.enum(["BLOCKS", "CUSTOM_HTML"]).optional(),
});

function coerceBlocks(raw: unknown): CreditFunnelBlock[] {
  if (!Array.isArray(raw)) return [];
  return (raw as CreditFunnelBlock[]).filter((b) => b && typeof b === "object");
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const basePath = auth.variant === "credit" ? "/credit" : "";

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const page = await prisma.creditFunnelPage
    .findFirst({
      where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
      select: {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        blocksJson: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
    })
    .catch(() => null);

  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ownerId = auth.session.user.id;

  const blocksFromClient = coerceBlocks(parsed.data.blocksJson);
  const blocksFromDb = coerceBlocks(page.blocksJson);
  const blocks = blocksFromClient.length ? blocksFromClient : blocksFromDb;

  const html = blocksToCustomHtmlDocument({
    blocks,
    pageId: page.id,
    ownerId,
    basePath,
    title: parsed.data.title || page.title || "Funnel page",
  });

  const updated = await prisma.creditFunnelPage.update({
    where: { id: page.id },
    data: {
      ...(blocksFromClient.length ? { blocksJson: blocksFromClient as any } : null),
      customHtml: html,
      ...(parsed.data.setEditorMode ? { editorMode: parsed.data.setEditorMode } : null),
    },
    select: {
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      blocksJson: true,
      customHtml: true,
      customChatJson: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, html: updated.customHtml, page: updated });
}
