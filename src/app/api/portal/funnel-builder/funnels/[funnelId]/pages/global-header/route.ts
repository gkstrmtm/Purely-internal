import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  applyDraftHtmlWriteCompat,
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtmlList,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { getCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { readFunnelBookingRouting } from "@/lib/funnelBookingRouting";
import { createFunnelPageBlockSnapshotUpdate } from "@/lib/funnelPageState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GLOBAL_HEADER_KEY = "__global_header__";

const postSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("apply"),
    headerBlock: z.unknown(),
  }),
  z.object({
    mode: z.literal("unset"),
    keepOnPageId: z.string().trim().min(1),
    localHeaderBlock: z.unknown(),
  }),
]);

function isHeaderNavBlock(b: CreditFunnelBlock | null | undefined): b is Extract<CreditFunnelBlock, { type: "headerNav" }> {
  return Boolean(b && typeof b === "object" && (b as any).type === "headerNav");
}

function removeGlobalHeaders(blocks: CreditFunnelBlock[]): CreditFunnelBlock[] {
  let changed = false;
  const out = blocks.filter((b) => {
    if (b.type !== "headerNav") return true;
    const p: any = b.props as any;
    const isGlobal = p?.isGlobal === true;
    const globalKey = typeof p?.globalKey === "string" ? String(p.globalKey).trim() : "";
    if (isGlobal || globalKey === GLOBAL_HEADER_KEY) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed ? out : blocks;
}

function coerceHeaderNavFromUnknown(raw: unknown, forceGlobal: boolean): Extract<CreditFunnelBlock, { type: "headerNav" }> | null {
  const arr = coerceBlocksJson([raw]);
  const first = arr[0] || null;
  if (!isHeaderNavBlock(first)) return null;

  const next: any = {
    ...first,
    props: {
      ...(first.props as any),
      globalKey: GLOBAL_HEADER_KEY,
      ...(forceGlobal ? { isGlobal: true } : { isGlobal: false, globalKey: undefined }),
    },
  };

  const coerced = coerceBlocksJson([next])[0] as any;
  return isHeaderNavBlock(coerced) ? (coerced as any) : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  if (!funnelId) return NextResponse.json({ ok: false, error: "Invalid funnelId" }, { status: 400 });
  const basePath = auth.variant === "credit" ? "/credit" : "";

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();
  const settings = await getCreditFunnelBuilderSettings(auth.session.user.id).catch(() => ({}));
  const defaultBookingCalendarId = readFunnelBookingRouting(settings, funnelId)?.calendarId ?? undefined;

  const pages = await prisma.creditFunnelPage.findMany({
    where: { funnelId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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

  if (parsed.data.mode === "apply") {
    const header = coerceHeaderNavFromUnknown(parsed.data.headerBlock, true);
    if (!header) {
      return NextResponse.json({ ok: false, error: "Invalid header block" }, { status: 400 });
    }

    const updates = pages.map((p) => {
      const coerced = coerceBlocksJson(p.blocksJson);
      const first = coerced[0];
      const pageSettings = first && first.type === "page" ? first : null;
      const editable = coerced.filter((b) => b.type !== "page");
      const withoutGlobal = removeGlobalHeaders(editable);

      const nextEditable = [header, ...withoutGlobal];
      const nextBlocks = pageSettings ? [pageSettings, ...nextEditable] : nextEditable;
      const nextPageUpdate = createFunnelPageBlockSnapshotUpdate({
        blocks: nextBlocks,
        pageId: p.id,
        ownerId: auth.session.user.id,
        defaultBookingCalendarId,
        basePath,
        title: p.title || "Funnel page",
      });

      return prisma.creditFunnelPage.update({
        where: { id: p.id },
        data: applyDraftHtmlWriteCompat(nextPageUpdate as any, hasDraftHtml),
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
    });

    const updatedPages = await prisma.$transaction(updates);
    return NextResponse.json({ ok: true, pages: normalizeDraftHtmlList(updatedPages) });
  }

  // unset
  const localHeader = coerceHeaderNavFromUnknown(parsed.data.localHeaderBlock, false);
  if (!localHeader) {
    return NextResponse.json({ ok: false, error: "Invalid header block" }, { status: 400 });
  }

  const keepOnPageId = String(parsed.data.keepOnPageId || "").trim();
  const updates = pages.map((p) => {
    const coerced = coerceBlocksJson(p.blocksJson);
    const first = coerced[0];
    const pageSettings = first && first.type === "page" ? first : null;
    const editable = coerced.filter((b) => b.type !== "page");
    const withoutGlobal = removeGlobalHeaders(editable);

    const nextEditable = p.id === keepOnPageId ? [localHeader, ...withoutGlobal] : withoutGlobal;
    const nextBlocks = pageSettings ? [pageSettings, ...nextEditable] : nextEditable;
    const nextPageUpdate = createFunnelPageBlockSnapshotUpdate({
      blocks: nextBlocks,
      pageId: p.id,
      ownerId: auth.session.user.id,
      defaultBookingCalendarId,
      basePath,
      title: p.title || "Funnel page",
    });

    return prisma.creditFunnelPage.update({
      where: { id: p.id },
      data: applyDraftHtmlWriteCompat(nextPageUpdate as any, hasDraftHtml),
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
  });

  const updatedPages = await prisma.$transaction(updates);
  return NextResponse.json({ ok: true, pages: normalizeDraftHtmlList(updatedPages) });
}
