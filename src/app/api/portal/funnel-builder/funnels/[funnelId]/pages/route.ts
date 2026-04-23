import { NextResponse } from "next/server";

import { mutateCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { dbHasCreditFunnelEventTable, getCreditFunnelPageMetrics, readCreditFunnelTrackingSettings } from "@/lib/funnelEventTracking";
import {
  buildSuggestedPageNaming,
  inferFunnelPageIntentProfile,
  readFunnelBrief,
  readFunnelPageBrief,
  writeFunnelPageBrief,
} from "@/lib/funnelPageIntent";
import {
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtml,
  normalizeDraftHtmlList,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { consumeCredits } from "@/lib/credits";
import { addCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

const GLOBAL_HEADER_KEY = "__global_header__";

function normalizePageSlug(raw: unknown) {
  return String(typeof raw === "string" ? raw : "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function buildAvailablePageSlug(base: string, used: Set<string>) {
  const normalizedBase = normalizePageSlug(base) || "page";
  if (!used.has(normalizedBase)) return normalizedBase;
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = normalizePageSlug(`${normalizedBase}-${suffix}`);
    if (candidate && !used.has(candidate)) return candidate;
  }
  return normalizePageSlug(`${normalizedBase}-${Math.random().toString(36).slice(2, 6)}`) || normalizedBase;
}

function getGlobalHeaderBlockFromPages(pages: Array<{ blocksJson: unknown }>): CreditFunnelBlock | null {
  for (const p of pages) {
    const blocks = coerceBlocksJson(p.blocksJson);
    for (const b of blocks) {
      if (b.type !== "headerNav") continue;
      const key = typeof (b.props as any)?.globalKey === "string" ? String((b.props as any).globalKey) : "";
      if (key !== GLOBAL_HEADER_KEY) continue;
      return {
        ...b,
        props: {
          ...(b.props as any),
          isGlobal: true,
          globalKey: GLOBAL_HEADER_KEY,
        },
      } as CreditFunnelBlock;
    }
  }
  return null;
}

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

export async function GET(_req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
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

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true, slug: true, name: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();

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

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
    .catch(() => null);

  const [eventTableReady, pageMetrics] = await Promise.all([
    dbHasCreditFunnelEventTable(),
    getCreditFunnelPageMetrics(pages.map((page) => page.id)),
  ]);

  const pagesWithSeo = normalizeDraftHtmlList(pages).map((p) => ({
    ...p,
    seo: readFunnelPageSeo(settings?.dataJson ?? null, p.id),
    brief: readFunnelPageBrief(settings?.dataJson ?? null, p.id),
    executionSummary: (() => {
      const tracking = readCreditFunnelTrackingSettings(settings?.dataJson ?? null, funnelId, p.id);
      const metrics =
        pageMetrics.get(p.id) || {
          page_view: 0,
          cta_click: 0,
          form_submitted: 0,
          booking_created: 0,
          checkout_started: 0,
          add_to_cart: 0,
        };
      return {
        trackingReady: eventTableReady,
        metaPixelReady: Boolean(tracking.resolvedPixelId),
        metaPixelId: tracking.resolvedPixelId,
        metrics,
      };
    })(),
  }));

  return NextResponse.json({ ok: true, pages: pagesWithSeo });
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

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true, slug: true, name: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();

  const pagesForHeader = await prisma.creditFunnelPage.findMany({
    where: { funnelId },
    select: { blocksJson: true },
  });
  const globalHeaderBlock = getGlobalHeaderBlockFromPages(pagesForHeader);

  const body = (await req.json().catch(() => null)) as any;
  const explicitSlugRaw = typeof body?.slug === "string" ? body.slug : "";
  const explicitSlug = explicitSlugRaw.trim() ? normalizePageSlug(explicitSlugRaw) : "";
  const explicitTitle = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown : "";
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;

  if (explicitSlugRaw.trim() && !explicitSlug) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  }

  const suggestedNaming = buildSuggestedPageNaming({
    pageType: body?.pageType,
    primaryCta: body?.primaryCta,
    offer: body?.offer,
    fallbackSlug: explicitSlug || undefined,
    fallbackTitle: explicitTitle || undefined,
  });
  const baseSlug = normalizePageSlug(suggestedNaming.slug) || "page";
  const nextTitle = explicitTitle || suggestedNaming.title || baseSlug;

  const existingSlugs = new Set(
    (
      await prisma.creditFunnelPage.findMany({
        where: { funnelId },
        select: { slug: true },
      })
    )
      .map((page) => normalizePageSlug(page.slug))
      .filter(Boolean),
  );

  if (explicitSlug && existingSlugs.has(explicitSlug)) {
    return NextResponse.json(
      { ok: false, error: `A page at /${explicitSlug} already exists in this funnel. Choose a different path, e.g. /${explicitSlug}-2.` },
      { status: 409 },
    );
  }

  let normalizedSlug = explicitSlug || buildAvailablePageSlug(baseSlug, existingSlugs);
  if (!normalizedSlug) {
    return NextResponse.json({ ok: false, error: "Unable to derive a valid page path" }, { status: 400 });
  }

  const charged = await consumeCredits(auth.session.user.id, PORTAL_CREDIT_COSTS.funnelPageCreate);
  if (!charged.ok) {
    return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
  }

  try {
    let page: any = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        page = await prisma.creditFunnelPage.create({
          data: {
            funnelId,
            slug: normalizedSlug,
            title: nextTitle || normalizedSlug,
            contentMarkdown,
            sortOrder,
            ...(globalHeaderBlock ? { blocksJson: [globalHeaderBlock] as any } : {}),
          },
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
        break;
      } catch (error) {
        const message = String((error as any)?.message || "");
        if ((message.includes("unique") || message.includes("CreditFunnelPage_funnelId_slug_key")) && !explicitSlug) {
          existingSlugs.add(normalizedSlug);
          normalizedSlug = buildAvailablePageSlug(baseSlug, existingSlugs);
          continue;
        }
        throw error;
      }
    }

    if (!page) throw new Error("Failed to create page");

    const seededBrief = await mutateCreditFunnelBuilderSettings(auth.session.user.id, (current) => {
      const funnelBrief = readFunnelBrief(current, funnel.id);
      const nextBrief = inferFunnelPageIntentProfile({
        funnelBrief,
        funnelName: funnel.name,
        funnelSlug: funnel.slug,
        pageTitle: page.title,
        pageSlug: page.slug,
        pageType: body?.pageType,
        pageGoal: body?.pageGoal,
        audience: body?.audience,
        offer: body?.offer,
        primaryCta: body?.primaryCta,
        companyContext: body?.companyContext,
        qualificationFields: body?.qualificationFields,
        routingDestination: body?.routingDestination,
        formStrategy: body?.formStrategy,
        heroAssetMode: body?.heroAssetMode,
        shellFrameId: body?.shellFrameId,
        shellConcept: body?.shellConcept,
        sectionPlan: body?.sectionPlan,
        askClarifyingQuestions: body?.askClarifyingQuestions,
      });
      return {
        next: writeFunnelPageBrief(current, page.id, nextBrief),
        value: nextBrief,
      };
    });

    return NextResponse.json({ ok: true, page: { ...normalizeDraftHtml(page), brief: seededBrief.value } });
  } catch (e) {
    await addCredits(auth.session.user.id, PORTAL_CREDIT_COSTS.funnelPageCreate).catch(() => null);
    const message = String((e as any)?.message || "");
    if (message.includes("unique") || message.includes("CreditFunnelPage_funnelId_slug_key")) {
      return NextResponse.json(
        { ok: false, error: `A page at /${normalizedSlug} already exists in this funnel. Choose a different path, e.g. /${normalizedSlug}-2.` },
        { status: 409 },
      );
    }
    throw e;
  }
}
