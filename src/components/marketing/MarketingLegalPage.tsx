import type { ReactNode } from "react";

import Image from "next/image";
import Link from "next/link";

import { MARKETING_LEGAL_LINKS } from "@/components/marketing/legalLinks";

type MarketingLegalPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  updatedLabel: string;
  children: ReactNode;
};

export function MarketingLegalPage({
  eyebrow,
  title,
  summary,
  updatedLabel,
  children,
}: MarketingLegalPageProps) {
  return (
    <main className="min-h-screen bg-brand-mist text-brand-ink">
      <header className="border-b border-zinc-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/purelylogo1.png"
              alt="Purely"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
              priority
            />
            <div>
              <div className="text-sm font-semibold text-zinc-900">Purely</div>
              <div className="text-xs text-zinc-500">Public policy information</div>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-zinc-700">
            <Link className="rounded-full px-3 py-2 hover:bg-white" href="/">Home</Link>
            <Link className="rounded-full px-3 py-2 hover:bg-white" href="/services">Services</Link>
            <Link className="rounded-full px-3 py-2 hover:bg-white" href="/book-a-call">Book a call</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <section className="overflow-hidden rounded-4xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 bg-linear-to-r from-white via-brand-mist to-white px-6 py-8 sm:px-10 sm:py-10">
            <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600">
              {eyebrow}
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-zinc-950 sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-600 sm:text-base">{summary}</p>
            <div className="mt-4 text-xs font-medium text-zinc-500">{updatedLabel}</div>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <article className="space-y-8 text-sm leading-7 text-zinc-700 sm:text-[15px]">{children}</article>

            <aside className="h-fit rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-xs font-medium text-zinc-500">Quick links</div>
              <div className="mt-3 grid gap-2 text-sm font-semibold text-zinc-800">
                {MARKETING_LEGAL_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className="rounded-2xl border border-transparent px-3 py-2 hover:border-zinc-200 hover:bg-white">
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="mt-5 rounded-[1.25rem] border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                <div className="font-semibold">Meta integration note</div>
                <div className="mt-2 text-sm leading-6 text-sky-900">
                  Purely only prepares owner-scoped Meta and provider integrations. Businesses connect their own Pages and accounts, and Purely does not post without user approval.
                </div>
              </div>

              <div className="mt-4 rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="font-semibold">Review note</div>
                <div className="mt-2 text-sm leading-6 text-amber-900">
                  These public policy pages are operational drafts for users and provider reviewers. They are not formal legal advice and should be reviewed against your actual business practices and by counsel if appropriate.
                </div>
              </div>
            </aside>
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-4 border-t border-zinc-200 pt-6 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} Purely Automation</div>
          <div className="flex flex-wrap gap-4">
            {MARKETING_LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="font-semibold text-zinc-700 hover:text-zinc-950">
                {link.label}
              </Link>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}