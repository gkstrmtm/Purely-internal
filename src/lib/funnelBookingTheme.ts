import { coerceBlocksJson, type BlockStyle, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { prisma } from "@/lib/db";
import { parseHexColor, rgba, relativeLuminance } from "@/lib/colorUtils";
import { dbHasCreditFunnelPageDraftHtmlColumn, normalizeDraftHtmlList, withDraftHtmlSelect } from "@/lib/funnelPageDbCompat";
import { resolveFunnelPageRenderState } from "@/lib/funnelPageGraph";
import type { HostedThemeOverrides } from "@/lib/hostedTheme";

type ThemeStage = "current" | "published";

type FunnelThemePage = {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  editorMode: string | null;
  blocksJson: unknown;
  contentMarkdown: string | null;
  customHtml: string | null;
  draftHtml?: string;
};

function normalizeHex(value: unknown): string | null {
  const next = typeof value === "string" ? value.trim() : "";
  const short = /^#([0-9a-fA-F]{3})$/.exec(next);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(next);
  return full ? `#${full[1]}`.toLowerCase() : null;
}

function colorLightness(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 1;
  return relativeLuminance(rgb);
}

function colorSaturation(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 0;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function isNearWhite(hex: string) {
  return colorLightness(hex) >= 0.93 && colorSaturation(hex) <= 0.08;
}

function isReadableText(hex: string) {
  return colorLightness(hex) <= 0.55 || colorSaturation(hex) >= 0.12;
}

function pushColor(target: string[], value: unknown) {
  const normalized = normalizeHex(value);
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

function collectStyleColors(style: BlockStyle | undefined, out: { backgrounds: string[]; texts: string[]; accents: string[]; borders: string[] }) {
  if (!style) return;
  pushColor(out.backgrounds, style.backgroundColor);
  pushColor(out.texts, style.textColor);
  pushColor(out.borders, style.borderColor);
}

function walkBlockColors(blocks: CreditFunnelBlock[], out: { backgrounds: string[]; texts: string[]; accents: string[]; borders: string[] }) {
  for (const block of blocks) {
    collectStyleColors((block.props as any)?.style, out);
    pushColor(out.accents, (block.props as any)?.primaryColor);
    pushColor(out.accents, (block.props as any)?.accentColor);
    if (block.type === "section") {
      const keys = ["children", "leftChildren", "rightChildren"] as const;
      for (const key of keys) {
        const children = Array.isArray((block.props as any)?.[key]) ? ((block.props as any)[key] as CreditFunnelBlock[]) : [];
        if (children.length) walkBlockColors(children, out);
      }
    }
    if (block.type === "columns") {
      const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as Array<{ style?: BlockStyle; children?: CreditFunnelBlock[] }>) : [];
      for (const column of columns) {
        collectStyleColors(column?.style, out);
        if (Array.isArray(column?.children) && column.children.length) walkBlockColors(column.children, out);
      }
    }
  }
}

function findFirst<T>(items: T[], predicate: (item: T) => boolean): T | null {
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return null;
}

function deriveThemeFromBlocks(blocks: CreditFunnelBlock[]): HostedThemeOverrides | null {
  const colors = { backgrounds: [] as string[], texts: [] as string[], accents: [] as string[], borders: [] as string[] };
  walkBlockColors(coerceBlocksJson(blocks), colors);

  const bgHex = findFirst(colors.backgrounds, (hex) => !isNearWhite(hex)) ?? null;
  const textHex = findFirst(colors.texts, (hex) => isReadableText(hex)) ?? null;
  const primaryHex = findFirst(colors.backgrounds, (hex) => !isNearWhite(hex) && colorSaturation(hex) >= 0.08) ?? bgHex;
  const accentHex =
    findFirst(colors.accents, (hex) => colorSaturation(hex) >= 0.14) ??
    findFirst(colors.backgrounds, (hex) => colorSaturation(hex) >= 0.18 && !isNearWhite(hex)) ??
    primaryHex;

  if (!bgHex && !textHex && !primaryHex && !accentHex) return null;

  return {
    version: 1,
    bgHex,
    surfaceHex: bgHex,
    softHex: primaryHex ? rgba(primaryHex, 0.08) : null,
    borderHex: findFirst(colors.borders, (hex) => !isNearWhite(hex)) ?? (primaryHex ? rgba(primaryHex, 0.18) : null),
    textHex,
    mutedTextHex: textHex ? rgba(textHex, 0.72) : null,
    primaryHex,
    accentHex,
    linkHex: accentHex ?? primaryHex,
  };
}

function deriveThemeFromHtml(html: string): HostedThemeOverrides | null {
  const source = String(html || "");
  if (!source.trim()) return null;

  const bodyBackground = normalizeHex(source.match(/<body[^>]*style=["'][^"']*(?:background(?:-color)?\s*:\s*)(#[0-9a-fA-F]{3,6})/i)?.[1]);
  const bodyText = normalizeHex(source.match(/<body[^>]*style=["'][^"']*(?:color\s*:\s*)(#[0-9a-fA-F]{3,6})/i)?.[1]);
  const colors = Array.from(new Set((source.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) || []).map((value) => normalizeHex(value)).filter((value): value is string => Boolean(value))));

  const bgHex = bodyBackground ?? findFirst(colors, (hex) => !isNearWhite(hex) && colorLightness(hex) >= 0.72) ?? null;
  const textHex = bodyText ?? findFirst(colors, (hex) => isReadableText(hex) && colorLightness(hex) <= 0.55) ?? null;
  const primaryHex = findFirst(colors, (hex) => !isNearWhite(hex) && colorSaturation(hex) >= 0.08) ?? bgHex;
  const accentHex = findFirst(colors, (hex) => colorSaturation(hex) >= 0.18 && colorLightness(hex) <= 0.72) ?? primaryHex;

  if (!bgHex && !textHex && !primaryHex && !accentHex) return null;

  return {
    version: 1,
    bgHex,
    surfaceHex: bgHex,
    softHex: primaryHex ? rgba(primaryHex, 0.08) : null,
    borderHex: primaryHex ? rgba(primaryHex, 0.18) : null,
    textHex,
    mutedTextHex: textHex ? rgba(textHex, 0.72) : null,
    primaryHex,
    accentHex,
    linkHex: accentHex ?? primaryHex,
  };
}

function pageLooksBookingRelevant(page: FunnelThemePage) {
  const renderState = resolveFunnelPageRenderState(page, "current");
  if (renderState.kind === "blocks") return renderState.blocks.some((block) => block.type === "calendarEmbed");
  if (renderState.kind === "html") return /\/book\//i.test(renderState.html) || /Book a time|Schedule a call|Schedule your call|Schedule a consultation/i.test(renderState.html);
  return /book|schedule|consult/i.test(renderState.markdown);
}

function chooseSourcePage(pages: FunnelThemePage[], requestedPageId?: string | null) {
  const requested = String(requestedPageId || "").trim();
  if (requested) {
    const exact = pages.find((page) => page.id === requested) ?? null;
    if (exact) return exact;
  }
  return pages.find((page) => pageLooksBookingRelevant(page)) ?? pages[0] ?? null;
}

export async function deriveFunnelBookingHostedThemeFromSource(opts: {
  ownerId: string;
  funnelId: string;
  pageId?: string | null;
  stage?: ThemeStage;
}): Promise<HostedThemeOverrides | null> {
  const ownerId = String(opts.ownerId || "").trim();
  const funnelId = String(opts.funnelId || "").trim();
  if (!ownerId || !funnelId) return null;

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn().catch(() => false);
  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId },
    select: {
      pages: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: withDraftHtmlSelect(
          {
            id: true,
            title: true,
            slug: true,
            sortOrder: true,
            editorMode: true,
            blocksJson: true,
            contentMarkdown: true,
            customHtml: true,
          },
          hasDraftHtml,
        ),
      },
    },
  }).catch(() => null);

  const pages = normalizeDraftHtmlList((Array.isArray(funnel?.pages) ? funnel.pages : []) as FunnelThemePage[]);
  const sourcePage = chooseSourcePage(pages, opts.pageId ?? null);
  if (!sourcePage) return null;

  const renderState = resolveFunnelPageRenderState(sourcePage, opts.stage === "published" ? "published" : "current");
  if (renderState.kind === "blocks") return deriveThemeFromBlocks(renderState.blocks);
  if (renderState.kind === "html") return deriveThemeFromHtml(renderState.html);
  return deriveThemeFromHtml(renderState.markdown);
}