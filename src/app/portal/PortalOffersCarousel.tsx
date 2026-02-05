"use client";

import { useMemo, useRef } from "react";

type Offer = {
  title: string;
  description: string;
  tone: "blue" | "coral" | "ink";
};

export function PortalOffersCarousel() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

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
    ],
    [],
  );

  function scrollByCards(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-carousel-card='true']");
    const cardWidth = card?.offsetWidth ?? 320;
    el.scrollBy({ left: direction * (cardWidth + 16), behavior: "smooth" });
  }

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

        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            aria-label="Scroll left"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
            aria-label="Scroll right"
          >
            Next
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {offers.map((o) => (
          <div
            key={o.title}
            data-carousel-card="true"
            className={`min-w-[85%] snap-start rounded-3xl border p-6 sm:min-w-[360px] ${toneClasses[o.tone]}`}
          >
            <div className={`text-lg font-semibold ${toneTitle[o.tone]}`}>{o.title}</div>
            <div className="mt-2 text-sm text-zinc-700">{o.description}</div>
            <div className="mt-5 h-1 w-16 rounded-full bg-[color:var(--color-brand-pink)] opacity-60" />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 sm:hidden">
        <div>Swipe to see more</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 font-semibold text-brand-ink"
            aria-label="Scroll left"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            className="rounded-lg bg-brand-ink px-2 py-1 font-semibold text-white"
            aria-label="Scroll right"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
