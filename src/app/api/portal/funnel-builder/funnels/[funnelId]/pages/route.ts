import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { isMissingColumnError } from "@/lib/dbSchemaCompat";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtml,
  normalizeDraftHtmlList,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

const GLOBAL_HEADER_KEY = "__global_header__";

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

function pageSelect(hasDraftHtml: boolean) {
  return withDraftHtmlSelect(
    {
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
    hasDraftHtml,
  );
}

function pageSelectMinimal() {
  return {
    id: true,
    slug: true,
    title: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
  };
}

function normalizePageShape<T extends Record<string, unknown>>(page: T) {
  return {
    ...page,
    contentMarkdown: typeof page.contentMarkdown === "string" ? page.contentMarkdown : "",
    editorMode: typeof page.editorMode === "string" ? page.editorMode : "BLOCKS",
    blocksJson: Array.isArray(page.blocksJson) ? page.blocksJson : [],
    customHtml: typeof page.customHtml === "string" ? page.customHtml : "",
    customChatJson: page.customChatJson ?? null,
  };
}

async function findManyPagesWithDraftCompat(funnelId: string, hasDraftHtml: boolean) {
  try {
    return await prisma.creditFunnelPage.findMany({
      where: { funnelId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: pageSelect(hasDraftHtml),
    });
  } catch (error) {
    if (hasDraftHtml && isMissingColumnError(error, "draftHtml")) {
      return await prisma.creditFunnelPage.findMany({
        where: { funnelId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: pageSelect(false),
      });
    }

    const minimalPages = await prisma.creditFunnelPage.findMany({
      where: { funnelId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: pageSelectMinimal(),
    });
    return minimalPages.map((page) => normalizePageShape(page));
  }
}

async function createPageWithDraftCompat(
  data: Prisma.CreditFunnelPageCreateInput | Prisma.CreditFunnelPageUncheckedCreateInput,
  hasDraftHtml: boolean,
) {
  try {
    return await prisma.creditFunnelPage.create({
      data,
      select: pageSelect(hasDraftHtml),
    });
  } catch (error) {
    if (!hasDraftHtml || !isMissingColumnError(error, "draftHtml")) throw error;
    return await prisma.creditFunnelPage.create({
      data,
      select: pageSelect(false),
    });
  }
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
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();

  const pages = await findManyPagesWithDraftCompat(funnelId, hasDraftHtml);

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
    .catch(() => null);

  const pagesWithSeo = normalizeDraftHtmlList(pages.map((page) => normalizePageShape(page))).map((p) => ({
    ...p,
    seo: readFunnelPageSeo(settings?.dataJson ?? null, p.id),
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
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();

  const charged = await consumeCredits(auth.session.user.id, PORTAL_CREDIT_COSTS.funnelPageCreate);
  if (!charged.ok) {
    return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
  }

  const pagesForHeader = await prisma.creditFunnelPage.findMany({
    where: { funnelId },
    select: { blocksJson: true },
  });
  const globalHeaderBlock = getGlobalHeaderBlockFromPages(pagesForHeader);

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

  const page = await createPageWithDraftCompat(
    {
      funnelId,
      slug: normalizedSlug,
      title: title || normalizedSlug,
      contentMarkdown,
      sortOrder,
      ...(globalHeaderBlock ? { blocksJson: [globalHeaderBlock] as any } : {}),
    },
    hasDraftHtml,
  );

  return NextResponse.json({ ok: true, page: normalizeDraftHtml(page) });
}
