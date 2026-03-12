import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { publicKeyFromId } from "@/lib/publicHostedKeys";
import { renderTextTemplate } from "@/lib/textTemplate";
import { getBusinessProfileTemplateVars } from "@/lib/businessProfileAiContext.server";
import { AiSparkIcon } from "@/components/AiSparkIcon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FunnelSeo = {
  title?: string;
  description?: string;
  imageUrl?: string;
  noIndex?: boolean;
};

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

async function fetchFunnel(slug: string, key: string) {
  const s = String(slug || "").trim().toLowerCase();
  const k = String(key || "").trim();
  if (!s || !k) return null;

  const funnel = await prisma.creditFunnel
    .findFirst({
      where: { slug: s, id: { endsWith: k } },
      select: {
        id: true,
        ownerId: true,
        pages: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: 1,
          select: { id: true, title: true, contentMarkdown: true, editorMode: true, blocksJson: true, customHtml: true },
        },
      },
    })
    .catch(() => null);

  if (!funnel) return null;
  // Backward compatible: accept older links that used a different short-key length.
  // The DB lookup uses `endsWith` but we also validate the derived key for safety.
  if (publicKeyFromId(funnel.id, k.length) !== k) return null;

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: funnel.ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const seoSettings = readFunnelSeo(settings?.dataJson ?? null, funnel.id);
  const page = funnel.pages[0] || null;
  const templateVars = funnel.ownerId ? await getBusinessProfileTemplateVars(funnel.ownerId).catch(() => ({})) : {};
  const renderedCustomHtml =
    page?.editorMode === "CUSTOM_HTML" && page.customHtml
      ? renderTextTemplate(page.customHtml, templateVars)
      : (page?.customHtml ?? "");

  const seoFromCustomHtml = page?.editorMode === "CUSTOM_HTML" ? extractSeoFromCustomHtml(renderedCustomHtml || "") : null;
  const seo = mergeSeo(seoSettings, seoFromCustomHtml);

  return { funnel, page, seo, renderedCustomHtml };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}): Promise<Metadata> {
  const { slug, key } = await params;
  const loaded = await fetchFunnel(slug, key);
  if (!loaded) return {};

  const { page, seo } = loaded;
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
    robots: seo?.noIndex ? { index: false, follow: true } : undefined,
  };
}

export default async function HostedFunnelWithKeyPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  const { slug, key } = await params;
  const s = String(slug || "").trim().toLowerCase();
  const k = String(key || "").trim();
  if (!s || !k) notFound();

  const loaded = await fetchFunnel(s, k);
  if (!loaded) notFound();
  const { funnel, page, renderedCustomHtml } = loaded;
  const markdownBlocks = page ? parseBlogContent(page.contentMarkdown) : [];
  const blockBlocks = page ? coerceBlocksJson(page.blocksJson) : [];

  const billingModel = funnel.ownerId
    ? await getPortalBillingModelForOwner({ ownerId: funnel.ownerId, portalVariant: "portal" }).catch(() => "subscription" as const)
    : "subscription";
  const showWatermark = isCreditsOnlyBilling(billingModel);

  return (
    <main className="w-full min-h-screen">
      {page ? (
        <>
          {page.editorMode === "CUSTOM_HTML" ? (
            <iframe
              title={page.title}
              sandbox="allow-forms allow-popups allow-scripts"
              srcDoc={renderedCustomHtml || ""}
              className="h-[100vh] w-full bg-white"
            />
          ) : page.editorMode === "BLOCKS" ? (
            <div>
              {renderCreditFunnelBlocks({
                blocks: blockBlocks,
                basePath: "",
                context: { bookingOwnerId: funnel.ownerId, funnelPageId: page.id },
              })}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl p-8">
              <div className="prose prose-zinc max-w-none">
                {markdownBlocks.map((b, idx) => {
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
                        {b.items.map((item, j) => (
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
            <AiSparkIcon className="h-3.5 w-3.5 text-[color:var(--color-brand-blue)]" />
            Powered by Purely Automation
          </a>
        </div>
      ) : null}
    </main>
  );
}
