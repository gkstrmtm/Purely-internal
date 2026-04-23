import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { readFunnelBookingRouting } from "@/lib/funnelBookingRouting";
import { resolveFunnelPageRenderState } from "@/lib/funnelPageGraph";
import { AiSparkIcon } from "@/components/AiSparkIcon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditHostedFunnelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = String(slug || "").trim().toLowerCase();
  if (!s) notFound();

  const funnel = await prisma.creditFunnel
    .findUnique({
      where: { slug: s },
      select: {
        id: true,
        ownerId: true,
        name: true,
        slug: true,
        status: true,
        pages: {
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
  const settings = funnel.ownerId
    ? await prisma.creditFunnelBuilderSettings.findUnique({ where: { ownerId: funnel.ownerId }, select: { dataJson: true } }).catch(() => null)
    : null;
  const defaultBookingCalendarId = readFunnelBookingRouting(settings?.dataJson ?? null, funnel.id)?.calendarId ?? null;

  const page = funnel.pages[0] || null;
  const renderState = resolveFunnelPageRenderState(page, "published");
  const markdownBlocks = renderState.kind === "markdown" ? parseBlogContent(renderState.markdown) : [];

  return (
    <main className="w-full min-h-screen">
      {page ? (
        <>
          {renderState.kind === "html" ? (
            <iframe
              title={page.title}
              sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
                 allow="microphone"
              srcDoc={renderState.html}
              className="h-screen w-full bg-white"
            />
          ) : renderState.kind === "blocks" ? (
            <div>
              {renderCreditFunnelBlocks({
                blocks: renderState.blocks,
                basePath: "/credit",
                context: {
                  bookingOwnerId: funnel.ownerId,
                  defaultBookingCalendarId: defaultBookingCalendarId || undefined,
                  funnelPageId: page.id,
                  funnelSlug: funnel.slug,
                  funnelPathBase: `/credit/f/${encodeURIComponent(funnel.slug)}`,
                },
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
            <AiSparkIcon className="h-3.5 w-3.5 text-(--color-brand-blue)" />
            Powered by Purely Automation
          </a>
        </div>
      ) : null}
    </main>
  );
}
