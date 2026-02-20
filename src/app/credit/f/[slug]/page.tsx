import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";

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
        name: true,
        slug: true,
        status: true,
        pages: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: 1,
          select: {
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

  const page = funnel.pages[0] || null;
  const markdownBlocks = page ? parseBlogContent(page.contentMarkdown) : [];
  const blockBlocks = page ? coerceBlocksJson(page.blocksJson) : [];

  return (
    <main className="w-full min-h-screen">
      {page ? (
        <>
          {page.editorMode === "CUSTOM_HTML" ? (
            <iframe
              title={page.title}
              sandbox="allow-forms allow-popups allow-scripts"
              srcDoc={page.customHtml || ""}
              className="h-[100vh] w-full bg-white"
            />
          ) : page.editorMode === "BLOCKS" ? (
            <div>{renderCreditFunnelBlocks({ blocks: blockBlocks, basePath: "/credit" })}</div>
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
    </main>
  );
}
