"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Offer = {
  title: string;
  description: string;
  tone: "blue" | "coral" | "ink";
};

export function PortalOffersCarousel() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [active, setActive] = useState(0);

  const offers = useMemo<Offer[]>(
    () => [
      {
        title: "Blog automation",
        description: "Weekly posting that stays on brand and consistent.",
        tone: "blue",
      },
      {
        title: "Booking automation",
        description: "Less back-and-forth. More appointments on the calendar.",
        tone: "coral",
      },
      {
        title: "CRM follow-up",
        description: "Keep leads warm with simple, reliable follow-up.",
        tone: "ink",
      },
      {
        title: "Billing and access",
        description: "See what’s active, update payment, and add modules fast.",
        tone: "blue",
      },
      {
        title: "Onboarding help",
        description: "Get set up fast with a clear path to launch.",
        tone: "ink",
      },
      {
        title: "Content planning",
        description: "Keep topics organized and publishing steady.",
        tone: "coral",
      },
      {
        title: "Reporting snapshots",
        description: "Simple visibility into what’s running and saving time.",
        tone: "blue",
      },
      {
        title: "Add modules anytime",
        description: "Turn on the next piece when you want it.",
        tone: "ink",
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
            Add modules as you grow. Your portal always shows what’s live.
          </div>
        </div>
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
          <div
            key={`${o.title}-${i}`}
            data-carousel-card="true"
            className={`min-w-[85%] snap-start rounded-3xl border p-6 sm:min-w-[360px] ${toneClasses[o.tone]}`}
          >
            <div className={`text-lg font-semibold ${toneTitle[o.tone]}`}>{o.title}</div>
            <div className="mt-2 text-sm text-zinc-700">{o.description}</div>
            <div className="mt-5 h-1 w-16 rounded-full bg-[color:var(--color-brand-pink)] opacity-60" />
          </div>
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
