import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { hasPublicColumn } from "@/lib/dbSchema";
import { coerceFontFamily, coerceGoogleFamily, googleFontImportCss } from "@/lib/fontPresets";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { resolveCustomDomain } from "@/lib/customDomainResolver";

import { CreditHostedFormClient, type CreditFormStyle, type Field } from "@/app/credit/forms/[slug]/CreditHostedFormClient";
import { AiSparkIcon } from "@/components/AiSparkIcon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DomainRootMode = "DISABLED" | "DIRECTORY" | "REDIRECT";

function safeRootMode(raw: unknown): DomainRootMode {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (s === "DISABLED" || s === "DIRECTORY" || s === "REDIRECT") return s;
  return "DIRECTORY";
}

function safeSlug(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;
  if (s.length > 80) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return null;
  return s;
}

function readDomainSettings(settingsJson: unknown, domain: string): { rootMode: DomainRootMode; rootFunnelSlug: string | null } {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const domains = (settingsJson as any).customDomains;
  if (!domains || typeof domains !== "object" || Array.isArray(domains)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const row = (domains as any)[domain];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const rootMode = safeRootMode((row as any).rootMode);
  const rootFunnelSlug = safeSlug((row as any).rootFunnelSlug);
  return { rootMode, rootFunnelSlug };
}

function normalizeDomain(raw: unknown) {
  let s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;

  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0] || "";
  s = s.split("?")[0] || "";
  s = s.split("#")[0] || "";
  s = s.split(":")[0] || "";
  s = s.replace(/\.+$/, "");
  if (!s) return null;

  if (s.length > 253) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  if (s.includes("..")) return null;
  if (s.startsWith("-") || s.endsWith("-")) return null;
  return s;
}

function normalizeHost(raw: unknown): string | null {
  let s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0] || "";
  s = s.split("?")[0] || "";
  s = s.split("#")[0] || "";
  s = s.split(":")[0] || "";
  s = s.replace(/\.+$/, "");
  if (!s) return null;
  return s;
}

function addHostVariants(domains: Set<string>, raw: unknown) {
  const base = normalizeHost(raw);
  if (!base) return;
  domains.add(base);
  if (base.startsWith("www.")) {
    domains.add(base.slice(4));
  } else {
    domains.add(`www.${base}`);
  }
}

function readFunnelDomains(settingsJson: unknown): Record<string, string> {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return {};
  const raw = (settingsJson as any).funnelDomains;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as any)) {
    if (typeof k !== "string" || !k.trim()) continue;
    const domain = normalizeDomain(v);
    if (!domain) continue;
    out[k] = domain;
  }
  return out;
}

type FunnelSeo = {
  title?: string;
  description?: string;
  imageUrl?: string;
  noIndex?: boolean;
};

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

  const faviconUrl = typeof (row as any).faviconUrl === "string" ? String((row as any).faviconUrl).trim().slice(0, 500) : "";
  const out: FunnelPageSeo = {};
  if (faviconUrl) out.faviconUrl = faviconUrl;
  return Object.keys(out).length ? out : null;
}

function readFunnelSeo(settingsJson: unknown, funnelId: string): FunnelSeo | null {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;
  const raw = (settingsJson as any).funnelSeo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = (raw as any)[funnelId];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const title = typeof (row as any).title === "string" ? (row as any).title.trim().slice(0, 120) : "";
  const description = typeof (row as any).description === "string" ? (row as any).description.trim().slice(0, 300) : "";
  const imageUrl = typeof (row as any).imageUrl === "string" ? (row as any).imageUrl.trim().slice(0, 500) : "";
  const noIndex = (row as any).noIndex === true;
  const out: FunnelSeo = {};
  if (title) out.title = title;
  if (description) out.description = description;
  if (imageUrl) out.imageUrl = imageUrl;
  if (noIndex) out.noIndex = true;
  return Object.keys(out).length ? out : null;
}

function extractSeoFromCustomHtml(html: string): FunnelSeo {
  const h = String(html || "");
  const out: FunnelSeo = {};

  const titleMatch = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    const t = titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 120);
    if (t) out.title = t;
  }

  const meta = (nameOrProp: string) => {
    const re = new RegExp(
      `<meta\\s+[^>]*?(?:name|property)=["']${nameOrProp}["'][^>]*?content=["']([^"']+)["'][^>]*?>`,
      "i",
    );
    const m = h.match(re);
    return m?.[1] ? m[1].trim() : "";
  };

  const description = meta("description").slice(0, 300);
  if (description) out.description = description;

  const ogTitle = meta("og:title").slice(0, 120);
  if (ogTitle) out.title = ogTitle;

  const ogDescription = meta("og:description").slice(0, 300);
  if (ogDescription) out.description = ogDescription;

  const ogImage = meta("og:image").slice(0, 500);
  if (ogImage) out.imageUrl = ogImage;

  const robots = meta("robots");
  if (robots && /noindex/i.test(robots)) out.noIndex = true;

  return out;
}

function mergeSeo(base: FunnelSeo | null, override: FunnelSeo | null): FunnelSeo | null {
  const b = base || {};
  const o = override || {};
  const out: FunnelSeo = {
    ...(b.title ? { title: b.title } : {}),
    ...(b.description ? { description: b.description } : {}),
    ...(b.imageUrl ? { imageUrl: b.imageUrl } : {}),
    ...(b.noIndex ? { noIndex: true } : {}),
  };
  if (o.title) out.title = o.title;
  if (o.description) out.description = o.description;
  if (o.imageUrl) out.imageUrl = o.imageUrl;
  if (o.noIndex) out.noIndex = true;
  return Object.keys(out).length ? out : null;
}

function normalizeSegments(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
}

function getDefaultFields(): Field[] {
  return [
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "message", label: "Message", type: "textarea" },
  ];
}

function parseFields(schemaJson: unknown): Field[] {
  if (!schemaJson || typeof schemaJson !== "object") return getDefaultFields();
  const fields = (schemaJson as any).fields;
  if (!Array.isArray(fields)) return getDefaultFields();

  const allowed = new Set<Field["type"]>([
    "short_answer",
    "long_answer",
    "paragraph",
    "name",
    "email",
    "phone",
    "checklist",
    "radio",
    // legacy
    "text",
    "tel",
    "textarea",
  ]);

  const out: Field[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const name = typeof (f as any).name === "string" ? (f as any).name.trim() : "";
    const label = typeof (f as any).label === "string" ? (f as any).label.trim() : "";
    const type = (f as any).type;
    const required = (f as any).required === true;
    const optionsRaw = (f as any).options;

    if (!name || !label) continue;
    if (!allowed.has(type)) continue;
    const options = Array.isArray(optionsRaw)
      ? optionsRaw
          .filter((x: any) => typeof x === "string")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 50)
      : undefined;
    out.push({ name, label, type, required, options });
  }

  return out.length ? out.slice(0, 25) : getDefaultFields();
}

function parseHexColor(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s === "transparent") return "transparent";
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  return s;
}

function parseStyle(schemaJson: unknown): CreditFormStyle {
  if (!schemaJson || typeof schemaJson !== "object") return {};
  const raw = (schemaJson as any).style;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: CreditFormStyle = {};
  const pageBg = parseHexColor((raw as any).pageBg);
  const cardBg = parseHexColor((raw as any).cardBg);
  const buttonBg = parseHexColor((raw as any).buttonBg);
  const buttonText = parseHexColor((raw as any).buttonText);
  const inputBg = parseHexColor((raw as any).inputBg);
  const inputBorder = parseHexColor((raw as any).inputBorder);
  const textColor = parseHexColor((raw as any).textColor);
  const fontFamily = coerceFontFamily((raw as any).fontFamily);
  const fontGoogleFamily = coerceGoogleFamily((raw as any).fontGoogleFamily);

  if (pageBg) out.pageBg = pageBg;
  if (cardBg) out.cardBg = cardBg;
  if (buttonBg) out.buttonBg = buttonBg;
  if (buttonText) out.buttonText = buttonText;
  if (inputBg) out.inputBg = inputBg;
  if (inputBorder) out.inputBorder = inputBorder;
  if (textColor) out.textColor = textColor;
  if (fontFamily) out.fontFamily = fontFamily;
  if (fontGoogleFamily) out.fontGoogleFamily = fontGoogleFamily;

  const radiusPx = (raw as any).radiusPx;
  if (typeof radiusPx === "number" && Number.isFinite(radiusPx)) {
    out.radiusPx = Math.max(0, Math.min(40, Math.round(radiusPx)));
  }

  return out;
}



function FunnelMarkdown({ blocks }: { blocks: any[] }) {
  return (
    <div className="prose prose-zinc max-w-none">
      {blocks.map((b, idx) => {
        if (b.type === "h2") {
          return (
            <h2 key={idx} className="pt-4 text-xl font-bold text-zinc-900">
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
            </h2>
          );
        }
        if (b.type === "h3") {
          return (
            <h3 key={idx} className="pt-2 text-lg font-bold text-zinc-900">
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
            </h3>
          );
        }
        if (b.type === "p") {
          return (
            <p key={idx} className="text-base leading-relaxed text-zinc-700">
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
            </p>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-6 text-zinc-700">
              {b.items.map((item: string, j: number) => (
                <li key={j}>
                  <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(item) }} />
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "img") {
          return (
            <div key={idx} className="overflow-hidden rounded-2xl border border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={b.alt} className="h-auto w-full" />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

async function renderFunnel(
  ownerId: string,
  slug: string,
  funnelDomains: Record<string, string>,
  allowedDomains: Set<string>,
  opts: { funnelPathBase: string; pageSlug?: string | null },
) {
  const pageSlug = opts?.pageSlug || null;
  const funnelPathBase = opts.funnelPathBase;

  const funnel = await prisma.creditFunnel
    .findFirst({
      where: { ownerId, slug: { equals: slug, mode: "insensitive" }, status: "ACTIVE" },
      select: {
        id: true,
        ownerId: true,
        pages: pageSlug
          ? {
              where: { slug: { equals: pageSlug, mode: "insensitive" } },
              take: 1,
              select: {
                id: true,
                title: true,
                contentMarkdown: true,
                editorMode: true,
                blocksJson: true,
                customHtml: true,
              },
            }
          : {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              take: 1,
              select: {
                id: true,
                title: true,
                contentMarkdown: true,
                editorMode: true,
                blocksJson: true,
                customHtml: true,
              },
            },
      },
    })
    .catch(() => null);

  if (!funnel) notFound();

  const billingModel = funnel.ownerId
    ? await getPortalBillingModelForOwner({ ownerId: funnel.ownerId, portalVariant: "portal" }).catch(() => "subscription" as const)
    : "subscription";
  const showWatermark = isCreditsOnlyBilling(billingModel);

  const assignedDomain = funnelDomains[funnel.id] ?? null;
  if (assignedDomain && !allowedDomains.has(assignedDomain)) notFound();

  const page = funnel.pages[0] || null;
  if (pageSlug && !page) notFound();
  const markdownBlocks = page ? parseBlogContent(page.contentMarkdown) : [];
  const blockBlocks = page ? coerceBlocksJson(page.blocksJson) : [];

  const [hasBrandFontFamily, hasBrandFontGoogleFamily] = await Promise.all([
    hasPublicColumn("BusinessProfile", "brandFontFamily"),
    hasPublicColumn("BusinessProfile", "brandFontGoogleFamily"),
  ]);

  const profileSelect: Record<string, boolean> = {};
  if (hasBrandFontFamily) profileSelect.brandFontFamily = true;
  if (hasBrandFontGoogleFamily) profileSelect.brandFontGoogleFamily = true;

  const profile = Object.keys(profileSelect).length
    ? await prisma.businessProfile
        .findUnique({ where: { ownerId }, select: profileSelect as any })
        .catch(() => null)
    : null;

  const brandFontFamily = coerceFontFamily((profile as any)?.brandFontFamily);
  const brandFontGoogleFamily = coerceGoogleFamily((profile as any)?.brandFontGoogleFamily);
  const brandGoogleCss = brandFontGoogleFamily ? googleFontImportCss(brandFontGoogleFamily) : null;
  const brandFontStyle = brandFontFamily ? ({ fontFamily: brandFontFamily } as const) : undefined;

  const customHtmlSrcDoc = (() => {
    if (!page || page.editorMode !== "CUSTOM_HTML") return null;
    if (!brandGoogleCss && !brandFontFamily) return page.customHtml || "";

    const cssLines = [
      brandGoogleCss,
      brandFontFamily ? `html, body { font-family: ${brandFontFamily}; }` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const injection = cssLines ? `<style>${cssLines}</style>` : "";
    const html = String(page.customHtml || "");
    if (!injection) return html;

    const headClose = html.match(/<\/head\s*>/i);
    if (headClose?.index !== undefined) {
      const idx = headClose.index;
      return `${html.slice(0, idx)}${injection}${html.slice(idx)}`;
    }

    return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${injection}</head><body>${html}</body></html>`;
  })();

  return (
    <main className="w-full min-h-screen" style={brandFontStyle}>
      {brandGoogleCss ? <style>{brandGoogleCss}</style> : null}
      {page ? (
        <>
          {page.editorMode === "CUSTOM_HTML" ? (
            <iframe
              title={page.title}
              sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
              allow="microphone"
              srcDoc={customHtmlSrcDoc ?? (page.customHtml || "")}
              className="h-screen w-full bg-white"
            />
          ) : page.editorMode === "BLOCKS" ? (
            <div>
              {renderCreditFunnelBlocks({
                blocks: blockBlocks,
                basePath: "",
                context: {
                  bookingOwnerId: funnel.ownerId,
                  funnelPageId: page.id,
                  funnelSlug: slug,
                  funnelPathBase,
                },
              })}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl p-8">
              <FunnelMarkdown blocks={markdownBlocks} />
            </div>
          )}
        </>
      ) : (
        <div className="mx-auto w-full max-w-3xl p-8">
          <p className="text-sm text-zinc-700">No pages yet for this funnel.</p>
        </div>
      )}

      {showWatermark ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-4">
          <a
            href="https://purelyautomation.com"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/75 px-3 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm backdrop-blur hover:bg-white hover:text-zinc-900"
          >
            <AiSparkIcon className="h-3.5 w-3.5 text-(--color-brand-blue)" />
            Powered by Purely Automation
          </a>
        </div>
      ) : null}
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string; path?: string[] }>;
}): Promise<Metadata> {
  const { domain, path } = await params;
  const host = normalizeHost(decodeURIComponent(String(domain || "")));
  if (!host) return {};

  const mapping = await resolveCustomDomain(host);
  if (!mapping || mapping.status !== "VERIFIED") {
    return { title: mapping ? "Domain pending verification" : undefined };
  }

  const segments = normalizeSegments(path);
  const first = segments[0] || "";
  const second = segments[1] || "";
  const third = segments[2] || "";

  // Only handle funnel metadata for /{slug} and /f/{slug}.
  if (!first || first === "forms" || first === "form" || first === "api") return { title: host };
  const funnelSlug = first === "f" && second ? second : first;
  if (!funnelSlug) return { title: host };

  const funnelPageSlug = first === "f" ? safeSlug(third) : null;

  const settingsRow = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { dataJson: true } })
    .catch(() => null);
  const settingsJson = settingsRow?.dataJson ?? null;
  const funnelDomains = readFunnelDomains(settingsJson);
  const allowedDomains = new Set<string>();
  addHostVariants(allowedDomains, mapping.matchedDomain);
  addHostVariants(allowedDomains, host);

  const funnel = await prisma.creditFunnel
    .findFirst({
      where: { ownerId: mapping.ownerId, slug: funnelSlug, status: "ACTIVE" },
      select: {
        id: true,
        pages: {
          ...(funnelPageSlug
            ? { where: { slug: { equals: funnelPageSlug, mode: "insensitive" } }, take: 1 }
            : { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1 }),
          select: { id: true, title: true, editorMode: true, customHtml: true },
        },
      },
    })
    .catch(() => null);

  if (!funnel) return { title: host };
  const assignedDomain = funnelDomains[funnel.id] ?? null;
  if (assignedDomain && !allowedDomains.has(assignedDomain)) return { title: host };

  const page = funnel.pages[0] || null;
  const seoSettings = readFunnelSeo(settingsJson, funnel.id);
  const seoFromCustomHtml = page?.editorMode === "CUSTOM_HTML" ? extractSeoFromCustomHtml(page.customHtml || "") : null;
  const seo = mergeSeo(seoSettings, seoFromCustomHtml);

  const pageId = (page as any)?.id ? String((page as any).id) : "";
  const pageSeo = pageId ? readFunnelPageSeo(settingsJson, pageId) : null;
  const faviconUrl = typeof pageSeo?.faviconUrl === "string" ? pageSeo.faviconUrl : "";

  const title = seo?.title || page?.title || "";
  const description = seo?.description || "";

  return {
    title: title || undefined,
    description: description || undefined,
    openGraph: seo?.imageUrl
      ? {
          title: title || undefined,
          description: description || undefined,
          images: [{ url: seo.imageUrl }],
        }
      : undefined,
    icons: faviconUrl ? { icon: faviconUrl, shortcut: faviconUrl } : undefined,
    robots: seo?.noIndex ? { index: false, follow: true } : undefined,
  };
}

export default async function CustomDomainCatchallPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; path?: string[] }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { domain, path } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const host = normalizeHost(decodeURIComponent(String(domain || "")));
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();

  if (mapping.status !== "VERIFIED") {
    return (
      <main className="mx-auto w-full max-w-2xl p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Domain pending verification</h1>
        <p className="mt-2 text-sm text-zinc-700">
          This domain is saved, but not verified yet. DNS changes can take time to propagate.
        </p>
      </main>
    );
  }

  const segments = normalizeSegments(path);

  const settingsRow = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const funnelDomains = readFunnelDomains(settingsRow?.dataJson ?? null);
  const allowedDomains = new Set<string>();
  addHostVariants(allowedDomains, mapping.matchedDomain);
  addHostVariants(allowedDomains, host);

  const settings = (() => {
    const direct = readDomainSettings(settingsRow?.dataJson ?? null, mapping.matchedDomain);
    if (direct.rootMode !== "DIRECTORY" || direct.rootFunnelSlug) return direct;
    if (host !== mapping.matchedDomain) {
      const alt = readDomainSettings(settingsRow?.dataJson ?? null, host);
      return alt;
    }
    return direct;
  })();

  // Root behavior
  if (segments.length === 0) {
    if (settings.rootMode === "DISABLED") notFound();
    if (settings.rootMode === "REDIRECT" && settings.rootFunnelSlug) {
      redirect(`/${settings.rootFunnelSlug}`);
    }

    const funnels = await prisma.creditFunnel.findMany({
      where: { ownerId: mapping.ownerId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, slug: true },
      take: 100,
    });

    const visibleFunnels = funnels.filter((f) => {
      const assigned = funnelDomains[f.id] ?? null;
      if (!assigned) return true;
      return allowedDomains.has(assigned);
    });

    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Funnels</h1>
        <p className="mt-2 text-sm text-zinc-600">Choose a page to visit.</p>

        <div className="mt-6 space-y-3">
          {visibleFunnels.length ? (
            visibleFunnels.map((f) => (
              <Link
                key={f.id}
                href={`/${encodeURIComponent(f.slug)}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
              >
                <div className="text-sm font-semibold text-zinc-900">{f.name}</div>
                <div className="mt-1 text-xs font-mono text-zinc-600">/{f.slug}</div>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No active funnels yet.</div>
          )}
        </div>
      </main>
    );
  }

  // /f/<slug>
  if (segments[0] === "f") {
    const funnelSlug = safeSlug(segments[1]);
    const funnelPageSlug = safeSlug(segments[2]);
    if (!funnelSlug) notFound();
    if (segments.length !== 2 && segments.length !== 3) notFound();
    return renderFunnel(mapping.ownerId, funnelSlug, funnelDomains, allowedDomains, {
      funnelPathBase: `/f/${encodeURIComponent(funnelSlug)}`,
      pageSlug: funnelPageSlug,
    });
  }

  // /forms/<slug>
  if (segments[0] === "forms") {
    const formSlug = safeSlug(segments[1]);
    if (!formSlug || segments.length > 2) notFound();

    const embedRaw = resolvedSearchParams?.embed;
    const embed = Array.isArray(embedRaw) ? embedRaw[0] === "1" : embedRaw === "1";

    const form = await prisma.creditForm
      .findFirst({ where: { ownerId: mapping.ownerId, slug: formSlug }, select: { name: true, slug: true, schemaJson: true } })
      .catch(() => null);

    if (!form) notFound();

    const fields = parseFields(form.schemaJson);
    const style = parseStyle(form.schemaJson);
    const pageBg = style.pageBg ?? (embed ? "transparent" : "#f4f4f5");

    return (
      <div className={embed ? "w-full" : "min-h-dvh w-full"} style={{ backgroundColor: pageBg }}>
        <main className={embed ? "mx-auto w-full max-w-3xl p-0" : "mx-auto w-full max-w-3xl p-8"}>
          <CreditHostedFormClient slug={form.slug} formName={form.name} fields={fields} embedded={embed} style={style} submitBasePath="/credit" />
        </main>
      </div>
    );
  }

  // /<funnelSlug>
  if (segments.length === 1) {
    const funnelSlug = safeSlug(segments[0]);
    if (!funnelSlug) notFound();
    return renderFunnel(mapping.ownerId, funnelSlug, funnelDomains, allowedDomains, {
      funnelPathBase: `/${encodeURIComponent(funnelSlug)}`,
    });
  }

  // /<funnelSlug>/<pageSlug>
  if (segments.length === 2) {
    const funnelSlug = safeSlug(segments[0]);
    const funnelPageSlug = safeSlug(segments[1]);
    if (!funnelSlug || !funnelPageSlug) notFound();
    return renderFunnel(mapping.ownerId, funnelSlug, funnelDomains, allowedDomains, {
      funnelPathBase: `/${encodeURIComponent(funnelSlug)}`,
      pageSlug: funnelPageSlug,
    });
  }

  notFound();
}
