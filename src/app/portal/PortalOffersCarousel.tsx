"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Offer = {
  title: string;
  description: string;
  tone: "blue" | "coral" | "ink";
  href: string;
};

export function PortalOffersCarousel() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [active, setActive] = useState(0);

  const offers = useMemo<Offer[]>(
    () => [
      {
        title: "Core Portal",
        description: "Your home base for services, billing, and reporting.",
        tone: "blue",
        href: "/services/portal",
      },
      {
        title: "Automation Builder",
        description: "Build workflows for the services you have turned on.",
        tone: "coral",
        href: "/services/automations",
      },
      {
        title: "Booking Automation",
        description: "Calendar plus confirmations, reminders, and follow-ups.",
        tone: "ink",
        href: "/services/booking",
      },
      {
        title: "Reviews + Verified Listing + Q&A",
        description: "Send review requests and build trust with a verified page.",
        tone: "blue",
        href: "/services/reviews",
      },
      {
        title: "Newsletter",
        description: "Weekly by default. AI-generated and easy to edit.",
        tone: "ink",
        href: "/services/newsletter",
      },
      {
        title: "Automated Blogs",
        description: "SEO posts published for you, on schedule.",
        tone: "coral",
        href: "/services/blogs",
      },
      {
        title: "AI Receptionist",
        description: "Answer calls, route requests, and log everything.",
        tone: "blue",
        href: "/services/ai-receptionist",
      },
      {
        title: "AI Outbound",
        description: "Calls, texts, and emails that follow up fast.",
        tone: "ink",
        href: "/services/ai-outbound-calls",
      },
      {
        title: "Lead Scraping (B2B)",
        description: "Business lead lists for your niche and service area.",
        tone: "coral",
        href: "/services/lead-scraping",
      },
      {
        title: "Lead Scraping (B2C)",
        description: "Consumer leads delivered on demand.",
        tone: "blue",
        href: "/services/lead-scraping",
      },
      {
        title: "Nurture Campaigns",
        description: "Install once. Let it keep working in the background.",
        tone: "ink",
        href: "/services/nurture-campaigns",
      },
    ],
    [],
  );

  const loopOffers = useMemo(() => [...offers, ...offers], [offers]);

  function getStepPx() {
    const el = scrollerRef.current;
    if (!el) return 360 + 16;
    const card = el.querySelector<HTMLElement>("[data-carousel-card='true']");
    const cardWidth = card?.offsetWidth ?? 360;
    return cardWidth + 16;
  }

  function normalizeScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const step = getStepPx();
    const loopWidth = step * offers.length;

    if (loopWidth <= 0) return;

    // Keep scrollLeft within the first loop so it feels infinite.
    if (el.scrollLeft >= loopWidth) {
      el.scrollLeft = el.scrollLeft - loopWidth;
    }
  }

  function setActiveFromScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const step = getStepPx();
    const idx = Math.round(el.scrollLeft / step);
    setActive(((idx % offers.length) + offers.length) % offers.length);
  }

  function stopAuto() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startAuto() {
    stopAuto();
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;

    intervalRef.current = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const step = getStepPx();
      el.scrollBy({ left: step, behavior: "smooth" });
    }, 3200);
  }

  useEffect(() => {
    startAuto();
    return () => stopAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toneClasses: Record<Offer["tone"], string> = {
    blue: "border-[color:rgba(29,78,216,0.20)] bg-[color:rgba(29,78,216,0.06)]",
    coral: "border-[color:rgba(251,113,133,0.28)] bg-[color:rgba(251,113,133,0.10)]",
    ink: "border-zinc-200 bg-white",
  };

  const toneTitle: Record<Offer["tone"], string> = {
    blue: "text-[color:var(--color-brand-blue)]",
    coral: "text-[color:var(--color-brand-pink)]",
    ink: "text-brand-ink",
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-brand-ink">What you can activate</div>
          <div className="mt-1 text-sm text-zinc-600">
            Start with one service or stack a few. Everything lives in one place.
          </div>
        </div>

        <Link
          href="/services"
          className="hidden rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 sm:inline-flex"
        >
          View all
        </Link>
      </div>

      <div
        ref={scrollerRef}
        onScroll={() => {
          normalizeScroll();
          setActiveFromScroll();
        }}
        onMouseEnter={() => stopAuto()}
        onMouseLeave={() => startAuto()}
        onTouchStart={() => stopAuto()}
        onTouchEnd={() => startAuto()}
        className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loopOffers.map((o, i) => (
          <Link
            key={`${o.title}-${i}`}
            data-carousel-card="true"
            href={o.href}
            className={`block min-w-[85%] snap-start rounded-3xl border p-6 sm:min-w-[360px] ${toneClasses[o.tone]}`}
          >
            <div className={`text-lg font-semibold ${toneTitle[o.tone]}`}>{o.title}</div>
            <div className="mt-2 text-sm text-zinc-700">{o.description}</div>
            <div className="mt-5 h-1 w-16 rounded-full bg-[color:var(--color-brand-pink)] opacity-60" />
            <div className="mt-4 text-sm font-semibold text-[color:var(--color-brand-blue)]">Learn more →</div>
          </Link>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {offers.map((_, i) => {
          const isActive = i === active;
          return (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2.5 w-2.5 rounded-full transition ${
                isActive
                  ? "bg-[color:var(--color-brand-blue)]"
                  : "bg-zinc-300 hover:bg-zinc-400"
              }`}
              onClick={() => {
                const el = scrollerRef.current;
                if (!el) return;
                const step = getStepPx();
                const loopWidth = step * offers.length;
                const base = Math.floor(el.scrollLeft / loopWidth) * loopWidth;
                el.scrollTo({ left: base + i * step, behavior: "smooth" });
              }}
            />
          );
        })}
        <div className="ml-2 text-xs text-zinc-500">Swipe to browse</div>
      </div>
    </div>
  );
}
