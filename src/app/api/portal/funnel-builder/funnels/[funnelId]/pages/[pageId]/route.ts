import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  getCreditFunnelBuilderSettings,
  getCreditFunnelBuilderSettingsTx,
  mutateCreditFunnelBuilderSettings,
  mutateCreditFunnelBuilderSettingsTx,
} from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { coerceBlocksJson } from "@/lib/creditFunnelBlocks";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { applyFunnelPageMutations } from "@/lib/funnelPageMutationApplier";
import { coerceFunnelPageMutations } from "@/lib/funnelPageMutations";
import { inferFunnelPageIntentProfile, readFunnelPageBrief, writeFunnelPageBrief } from "@/lib/funnelPageIntent";
import {
  applyDraftHtmlWriteCompat,
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtml,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { readFunnelBookingRouting } from "@/lib/funnelBookingRouting";
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
    select: { id: true, title: true, editorMode: true, blocksJson: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();
  const settings = await getCreditFunnelBuilderSettings(auth.session.user.id).catch(() => ({}));
  const defaultBookingCalendarId = readFunnelBookingRouting(settings, funnelId)?.calendarId ?? undefined;

  const body = (await req.json().catch(() => null)) as any;
  const wantsMutations = Object.prototype.hasOwnProperty.call(body ?? {}, "mutations");
  const requestedMutations = wantsMutations ? coerceFunnelPageMutations((body as any)?.mutations) : undefined;
  if (wantsMutations && requestedMutations == null) {
    return NextResponse.json({ ok: false, error: "Invalid mutations" }, { status: 400 });
  }
  if (wantsMutations && body?.blocksJson !== undefined) {
    return NextResponse.json({ ok: false, error: "Use either mutations or blocksJson, not both" }, { status: 400 });
  }
  if (wantsMutations && page.editorMode !== "BLOCKS") {
    return NextResponse.json({ ok: false, error: "Semantic mutations currently require a managed BLOCKS page" }, { status: 400 });
  }

  const wantsSeoUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "seo");
  const requestedSeoRaw = wantsSeoUpdate ? (body as any).seo : undefined;
  const requestedSeo = wantsSeoUpdate ? (requestedSeoRaw === null ? null : safePageSeo(requestedSeoRaw)) : undefined;
  if (wantsSeoUpdate && requestedSeoRaw !== null && requestedSeo == null) {
    return NextResponse.json({ ok: false, error: "Invalid seo" }, { status: 400 });
  }

  const wantsBriefUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "brief");
  const requestedBriefRaw = wantsBriefUpdate ? (body as any).brief : undefined;
  const requestedBrief = wantsBriefUpdate
    ? requestedBriefRaw === null
      ? null
      : requestedBriefRaw && typeof requestedBriefRaw === "object" && !Array.isArray(requestedBriefRaw)
        ? inferFunnelPageIntentProfile({ existing: requestedBriefRaw, pageTitle: body?.title ?? page.title, pageSlug: body?.slug })
        : undefined
    : undefined;
  if (wantsBriefUpdate && requestedBriefRaw !== null && requestedBrief === undefined) {
    return NextResponse.json({ ok: false, error: "Invalid brief" }, { status: 400 });
  }

  const data: any = {};
  let mutationWarnings: string[] = [];
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
      defaultBookingCalendarId,
      basePath: auth.variant === "credit" ? "/credit" : "",
      title: typeof data.title === "string" && data.title.trim() ? data.title : page.title || "Funnel page",
    });

    data.blocksJson = blockSnapshotUpdate.blocksJson;
    if (typeof body?.customHtml !== "string") data.customHtml = blockSnapshotUpdate.customHtml;
    if (typeof body?.draftHtml !== "string") data.draftHtml = blockSnapshotUpdate.draftHtml;
  }

  if (requestedMutations && requestedMutations.length > 0) {
    const currentBlocks = coerceBlocksJson(page.blocksJson);
    const mutationResult = applyFunnelPageMutations(currentBlocks, requestedMutations);
    mutationWarnings = mutationResult.warnings;

    const mutationSnapshotUpdate = createFunnelPageBlockSnapshotUpdate({
      blocks: mutationResult.blocks,
      pageId,
      ownerId: auth.session.user.id,
      defaultBookingCalendarId,
      basePath: auth.variant === "credit" ? "/credit" : "",
      title: typeof data.title === "string" && data.title.trim() ? data.title : page.title || "Funnel page",
    });

    data.editorMode = "BLOCKS";
    data.blocksJson = mutationSnapshotUpdate.blocksJson;
    if (typeof body?.customHtml !== "string") data.customHtml = mutationSnapshotUpdate.customHtml;
    if (typeof body?.draftHtml !== "string") data.draftHtml = mutationSnapshotUpdate.draftHtml;
  }

  const nextData = applyDraftHtmlWriteCompat(data, hasDraftHtml);

  const pageSelect = withDraftHtmlSelect({
    id: true,
    funnelId: true,
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
  }, hasDraftHtml);

  let transactionResult:
    | {
        updated: Prisma.CreditFunnelPageGetPayload<{ select: typeof pageSelect }>;
        nextSeo: FunnelPageSeo | null;
        nextBrief: ReturnType<typeof readFunnelPageBrief>;
      }
    | null = null;

  try {
    transactionResult = await prisma.$transaction(async (tx) => {
      const updated = Object.keys(nextData).length
        ? await tx.creditFunnelPage.update({
            where: { id: pageId },
            data: nextData,
            select: pageSelect,
          })
        : await tx.creditFunnelPage.findUniqueOrThrow({
            where: { id: pageId },
            select: pageSelect,
          });

      let settingsJson = await getCreditFunnelBuilderSettingsTx(tx, auth.session.user.id);
      if (wantsSeoUpdate || wantsBriefUpdate) {
        settingsJson = (
          await mutateCreditFunnelBuilderSettingsTx(tx, auth.session.user.id, (current) => {
            let nextJson: any = current;
            if (wantsSeoUpdate) nextJson = writeFunnelPageSeo(nextJson, pageId, (requestedSeo as any) ?? null);
            if (wantsBriefUpdate) nextJson = writeFunnelPageBrief(nextJson, pageId, requestedBrief ?? null);
            return { next: nextJson, value: nextJson };
          })
        ).dataJson;
      }

      return {
        updated,
        nextSeo: readFunnelPageSeo(settingsJson, pageId),
        nextBrief: readFunnelPageBrief(settingsJson, pageId),
      };
    });
  } catch (error) {
    const message = String((error as any)?.message || "");
    if (message.includes("unique") || message.includes("CreditFunnelPage_funnelId_slug_key")) {
      const attemptedSlug = typeof nextData.slug === "string" ? nextData.slug : typeof data.slug === "string" ? data.slug : "page";
      return NextResponse.json(
        { ok: false, error: `A page at /${attemptedSlug} already exists in this funnel. Choose a different path, e.g. /${attemptedSlug}-2.` },
        { status: 409 },
      );
    }
    throw error;
  }

  if (!transactionResult) {
    throw new Error("Missing page transaction result");
  }

  const { updated, nextSeo, nextBrief } = transactionResult;

  return NextResponse.json({ ok: true, page: { ...normalizeDraftHtml(updated), seo: nextSeo, brief: nextBrief }, mutationWarnings });
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

  await prisma.$transaction(async (tx) => {
    await mutateCreditFunnelBuilderSettingsTx(tx, auth.session.user.id, (current) => {
      let nextJson = writeFunnelPageSeo(current, pageId, null);
      nextJson = writeFunnelPageBrief(nextJson, pageId, null);
      return { next: nextJson, value: true };
    });

    await tx.creditFunnelPage.delete({ where: { id: pageId } });
  });

  return NextResponse.json({ ok: true });
}
