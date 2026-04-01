import Link from "next/link";

import { PortalOffersCarousel } from "@/app/portal/PortalOffersCarousel";

export default function CreditHomePage() {
  const directoryItems = [
    { href: "/", label: "Home" },
    { href: "/services", label: "Services" },
    { href: "/book-a-call", label: "Book a call" },
    { href: "/credit/get-started", label: "Get started" },
  ];

  return (
    <div className="w-full">
      <section className="w-full bg-[color:var(--color-brand-blue)] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/85">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white/90 hover:bg-white/15"
                >
                  <span aria-hidden="true">←</span>
                  Home
                </Link>
                <span className="text-white/40" aria-hidden="true">
                  /
                </span>
                <details className="group relative">
                  <summary className="cursor-pointer list-none select-none rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-semibold text-white/90 hover:bg-white/15 [&::-webkit-details-marker]:hidden">
                    Directory
                    <span className="ml-1 text-white/70" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <div className="absolute left-0 top-[calc(100%+10px)] z-10 w-[min(280px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-2 shadow-xl backdrop-blur">
                    {directoryItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block rounded-xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </details>
              </div>

              <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
                Manage your credit workflows and client progress in one place.
              </h1>
              <p className="mt-4 text-base text-[color:rgba(255,255,255,0.86)] sm:text-lg">
                Run your credit services, keep disputes and reports organized, and give clients a single clean app experience without bouncing between tools.
              </p>

              <div className="mt-4 text-sm text-white/80">Built for credit operations, client visibility, and smooth upgrades.</div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/credit/get-started"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-base font-semibold text-[color:var(--color-brand-blue)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                >
                  Get Started
                </Link>
                <Link
                  href="/credit/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-pink)] px-6 py-3 text-base font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
                >
                  Sign In
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-[color:rgba(255,255,255,0.18)] bg-[color:rgba(255,255,255,0.08)] p-5">
                  <div className="text-sm font-semibold">Credit-focused app</div>
                  <div className="mt-2 text-sm text-[color:rgba(255,255,255,0.80)]">
                    Keep credit-specific services and client work in a dedicated experience.
                  </div>
                </div>
                <div className="rounded-3xl border border-[color:rgba(255,255,255,0.18)] bg-[color:rgba(255,255,255,0.08)] p-5">
                  <div className="text-sm font-semibold">Client visibility</div>
                  <div className="mt-2 text-sm text-[color:rgba(255,255,255,0.80)]">
                    Let clients see what is active, what is pending, and what changed.
                  </div>
                </div>
                <div className="rounded-3xl border border-[color:rgba(255,255,255,0.18)] bg-[color:rgba(255,255,255,0.08)] p-5">
                  <div className="text-sm font-semibold">No cross-app jumping</div>
                  <div className="mt-2 text-sm text-[color:rgba(255,255,255,0.80)]">
                    Stay on the credit path from landing page through the full client app.
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[color:rgba(255,255,255,0.06)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[color:rgba(251,113,133,0.18)] blur-2xl" />
                <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[color:rgba(255,255,255,0.12)] blur-2xl" />

                <div className="relative">
                  <div className="text-xs font-semibold tracking-wide text-white/75">CREDIT FLOW</div>
                  <div className="mt-2 text-lg font-semibold text-white/95">Import → dispute → monitor</div>
                  <div className="mt-1 text-sm text-white/70">One view for the credit services your clients actually use.</div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {[
                      { title: "Reports", hint: "track changes" },
                      { title: "Disputes", hint: "manage letters" },
                      { title: "Results", hint: "client updates" },
                    ].map((n) => (
                      <div key={n.title} className="rounded-2xl border border-white/15 bg-[color:rgba(0,0,0,0.12)] p-4">
                        <div className="text-sm font-semibold text-white/95">{n.title}</div>
                        <div className="mt-1 text-xs text-white/65">{n.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <PortalOffersCarousel />
        </div>
      </section>
    </div>
  );
}