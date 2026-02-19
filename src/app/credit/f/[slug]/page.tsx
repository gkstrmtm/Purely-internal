import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";

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
          select: { title: true, contentMarkdown: true },
        },
      },
    })
    .catch(() => null);

  if (!funnel) notFound();

  const page = funnel.pages[0] || null;
  const blocks = page ? parseBlogContent(page.contentMarkdown) : [];

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit Funnel</div>
        <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">{page?.title || funnel.name}</h1>
        <p className="mt-2 text-sm text-zinc-600">Slug: /credit/f/{funnel.slug}</p>

        {page ? (
          <div className="prose prose-zinc mt-8 max-w-none">
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
        ) : (
          <p className="mt-6 text-sm text-zinc-700">No pages yet for this funnel.</p>
        )}
        <div className="mt-6 inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
          Status: {funnel.status}
        </div>
      </div>
    </main>
  );
}
