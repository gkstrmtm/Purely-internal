import Link from "next/link";

export function HostedNewsletterArchive({
  newsletters,
  basePath,
  emptyTitle,
  emptyDescription,
}: {
  newsletters: { slug: string; title: string; excerpt: string | null; sentAt: Date | null; updatedAt: Date }[];
  basePath: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <div className="mx-auto max-w-3xl">
        {newsletters.length === 0 ? (
          <div className="rounded-3xl border p-8" style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}>
            <div className="text-lg font-semibold" style={{ color: "var(--client-text)" }}>
              {emptyTitle}
            </div>
            <div className="mt-2 text-sm" style={{ color: "var(--client-muted)" }}>
              {emptyDescription}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {newsletters.map((newsletter) => (
              <Link
                key={newsletter.slug}
                href={`${basePath}/${newsletter.slug}`}
                className="block rounded-3xl border p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:brightness-[0.99]"
                style={{ borderColor: "var(--client-border)", backgroundColor: "var(--client-surface)" }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--client-muted)" }}>
                  {(newsletter.sentAt ?? newsletter.updatedAt).toLocaleString()}
                </div>
                <div className="mt-2 text-2xl" style={{ color: "var(--client-link)" }}>
                  {newsletter.title}
                </div>
                <div className="mt-3 text-sm leading-relaxed" style={{ color: "var(--client-text)" }}>
                  {newsletter.excerpt}
                </div>
                <div className="mt-5 text-sm font-bold" style={{ color: "var(--client-link)" }}>
                  read
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
