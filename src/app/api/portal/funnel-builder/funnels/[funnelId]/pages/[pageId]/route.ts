import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { coerceBlocksJson } from "@/lib/creditFunnelBlocks";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  applyDraftHtmlWriteCompat,
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtml,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { createFunnelPageBlockSnapshotUpdate } from "@/lib/funnelPageState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FunnelPageSeo = {
  faviconUrl?: string;
};

function readFunnelPageSeo(settingsJson: unknown, pageId: string): FunnelPageSeo | null {
  if (!pageId) return null;
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;
  const raw = (settingsJson as any).funnelPageSeo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = (raw as any)[pageId];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;

  const faviconUrl =
    typeof (row as any).faviconUrl === "string" ? String((row as any).faviconUrl).trim().slice(0, 500) : "";

  const out: FunnelPageSeo = {};
  if (faviconUrl) out.faviconUrl = faviconUrl;
  return Object.keys(out).length ? out : null;
}

function safePageSeo(raw: unknown): FunnelPageSeo | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const faviconUrl = typeof (raw as any).faviconUrl === "string" ? String((raw as any).faviconUrl).trim().slice(0, 500) : "";

  const out: FunnelPageSeo = {};
  if (faviconUrl) out.faviconUrl = faviconUrl;
  return out;
}

function writeFunnelPageSeo(settingsJson: unknown, pageId: string, seo: FunnelPageSeo | null) {
  const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
  const funnelPageSeo =
    base.funnelPageSeo && typeof base.funnelPageSeo === "object" && !Array.isArray(base.funnelPageSeo)
      ? { ...(base.funnelPageSeo as any) }
      : {};

  if (seo === null) delete funnelPageSeo[pageId];
  else funnelPageSeo[pageId] = seo;

  base.funnelPageSeo = funnelPageSeo;
  return base;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
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
    select: { id: true, title: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();

  const body = (await req.json().catch(() => null)) as any;

  const wantsSeoUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "seo");
  const requestedSeoRaw = wantsSeoUpdate ? (body as any).seo : undefined;
  const requestedSeo = wantsSeoUpdate ? (requestedSeoRaw === null ? null : safePageSeo(requestedSeoRaw)) : undefined;
  if (wantsSeoUpdate && requestedSeoRaw !== null && requestedSeo == null) {
    return NextResponse.json({ ok: false, error: "Invalid seo" }, { status: 400 });
  }

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
  if (typeof body?.draftHtml === "string") data.draftHtml = body.draftHtml;
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

  if (body?.blocksJson !== undefined) {
    const nextBlocks = coerceBlocksJson(body.blocksJson);
    const blockSnapshotUpdate = createFunnelPageBlockSnapshotUpdate({
      blocks: nextBlocks,
      pageId,
      ownerId: auth.session.user.id,
      basePath: auth.variant === "credit" ? "/credit" : "",
      title: typeof data.title === "string" && data.title.trim() ? data.title : page.title || "Funnel page",
    });

    data.blocksJson = blockSnapshotUpdate.blocksJson;
    if (typeof body?.customHtml !== "string") data.customHtml = blockSnapshotUpdate.customHtml;
    if (typeof body?.draftHtml !== "string") data.draftHtml = blockSnapshotUpdate.draftHtml;
  }

  const nextData = applyDraftHtmlWriteCompat(data, hasDraftHtml);

  const updated = Object.keys(nextData).length
    ? await prisma.creditFunnelPage.update({
        where: { id: pageId },
        data: nextData,
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
      })
    : await prisma.creditFunnelPage.findUniqueOrThrow({
        where: { id: pageId },
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

  let nextSeo: FunnelPageSeo | null = null;
  if (wantsSeoUpdate) {
    const existingSettings = await prisma.creditFunnelBuilderSettings
      .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
      .catch(() => null);
    const nextJson = writeFunnelPageSeo(existingSettings?.dataJson ?? null, pageId, (requestedSeo as any) ?? null);

    await prisma.creditFunnelBuilderSettings.upsert({
      where: { ownerId: auth.session.user.id },
      update: { dataJson: nextJson as any },
      create: { ownerId: auth.session.user.id, dataJson: nextJson as any },
      select: { ownerId: true },
    });

    nextSeo = readFunnelPageSeo(nextJson, pageId);
  } else {
    const existingSettings = await prisma.creditFunnelBuilderSettings
      .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
      .catch(() => null);
    nextSeo = readFunnelPageSeo(existingSettings?.dataJson ?? null, pageId);
  }

  return NextResponse.json({ ok: true, page: { ...normalizeDraftHtml(updated), seo: nextSeo } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
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
    select: { id: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Best-effort: clean up any stored page SEO.
  try {
    const existingSettings = await prisma.creditFunnelBuilderSettings
      .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
      .catch(() => null);
    if (existingSettings?.dataJson != null) {
      const nextJson = writeFunnelPageSeo(existingSettings.dataJson, pageId, null);
      await prisma.creditFunnelBuilderSettings.update({
        where: { ownerId: auth.session.user.id },
        data: { dataJson: nextJson as any },
        select: { ownerId: true },
      });
    }
  } catch {
    // ignore
  }

  await prisma.creditFunnelPage.delete({ where: { id: pageId } });
  return NextResponse.json({ ok: true });
}
