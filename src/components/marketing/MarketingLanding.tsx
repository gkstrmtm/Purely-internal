"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type DemoRequestPayload = {
  name: string;
  company: string;
  email: string;
  phone?: string;
  optedIn?: boolean;
};

type DemoRequestResponse = {
  requestId: string;
  leadId: string;
};

function PlayMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M160 110
           C160 90 176 74 196 74
           C206 74 216 78 224 84
           L388 190
           C416 208 416 248 388 266
           L224 372
           C216 378 206 382 196 382
           C176 382 160 366 160 346
           Z"
        stroke="currentColor"
        strokeWidth="44"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FeatureIcon({ name }: { name: "phone" | "message" | "calendar" | "dispatch" | "chart" | "megaphone" | "target" | "dial" | "social" }) {
  const common = "h-6 w-6 text-brand-blue";
  switch (name) {
    case "phone":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7.5 3.5h2.2c.6 0 1 .4 1 1 0 1 .2 2 .6 2.9.2.4.1.9-.2 1.2l-1.6 1.6c1.4 2.6 3.5 4.7 6.1 6.1l1.6-1.6c.3-.3.8-.4 1.2-.2.9.4 1.9.6 2.9.6.6 0 1 .4 1 1v2.2c0 .8-.7 1.5-1.5 1.5C10.2 21.8 2.2 13.8 2.2 5c0-.8.7-1.5 1.5-1.5H7.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "message":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4.5 5.5h15A2 2 0 0 1 21.5 7.5v8a2 2 0 0 1-2 2H9l-4.5 3v-3H4.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M6.5 9h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M6.5 12.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 3.5v3M17 3.5v3M4.5 7.5h15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6.5 5.5h11A3 3 0 0 1 20.5 8.5v10A3 3 0 0 1 17.5 21.5h-11A3 3 0 0 1 3.5 18.5v-10A3 3 0 0 1 6.5 5.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "dispatch":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3.5 7.5h10v10h-10v-10Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M13.5 10.5h4l2 2v5h-6v-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M7 19.5a1.5 1.5 0 1 0 0-.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17 19.5a1.5 1.5 0 1 0 0-.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "chart":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 19V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 19h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 16v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 16V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16 16v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "megaphone":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4.5 11.5v3.5c0 .8.7 1.5 1.5 1.5H7l1.5 3h2l-1.2-3h.7l9-3.5v-6l-9 3.5H6c-.8 0-1.5.7-1.5 1.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M20.5 9.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "target":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 21.5a9.5 9.5 0 1 1 9.5-9.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M12 17.5a5.5 5.5 0 1 1 5.5-5.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M12 13.5a1.5 1.5 0 1 1 1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M13.5 10.5 21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M21 3v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M21 3h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "dial":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 21.5a9.5 9.5 0 1 1 9.5-9.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "social":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7.5 14.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M16.5 21.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M16.5 8.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M10 10.5 14 7.5M10 12.5l4 3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function AutomationHighlights() {
  const items: Array<{ title: string; desc: string; icon: Parameters<typeof FeatureIcon>[0]["name"] }> = [
    { title: "Reception on inbound calls, SMS, and email", desc: "Capture requests and route them instantly.", icon: "phone" },
    { title: "Lead follow up and conversion", desc: "Automate reminders, outreach, and next steps.", icon: "message" },
    { title: "Dispatching employees and contractors", desc: "Schedule, assign, and notify without manual work.", icon: "dispatch" },
    { title: "Newsletters, blogs, and announcements", desc: "Publish and distribute content automatically.", icon: "megaphone" },
    { title: "Dashboard metrics and growth patterns", desc: "Track outcomes and spot opportunities early.", icon: "chart" },
    { title: "Lead capture and outbound acquisition", desc: "Forms, follow up, and outreach that stays consistent.", icon: "target" },
    { title: "Outbound calling", desc: "Organize calling and logging so nothing slips.", icon: "dial" },
    { title: "Social media presence and marketing", desc: "Keep your channels active with less effort.", icon: "social" },
  ];

  return (
    <section className="mx-auto mt-12 max-w-6xl px-6">
      <div className="mx-auto max-w-5xl rounded-[28px] bg-[#f7f5ef] p-8 shadow-sm">
        <div className="text-center font-brand text-3xl text-brand-blue">what we automate</div>
        <div className="mt-2 text-center text-base text-brand-ink">
          Systems that keep your business moving while you focus on higher leverage work.
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.title} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl bg-brand-blue/10">
                  <FeatureIcon name={item.icon} />
                </div>
                <div>
                  <div className="text-base font-semibold text-zinc-900">{item.title}</div>
                  <div className="mt-1 text-sm text-zinc-700">{item.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const faqs = [
    {
      q: "What kinds of businesses is this for?",
      a: "Any business that gets leads, schedules work, or follows up with customers. If you repeat the same steps every day, we can usually automate a big portion of it.",
    },
    {
      q: "Do you replace our tools or connect to them?",
      a: "Usually we connect to what you already use. We can also recommend a simpler stack if your current setup is fighting you.",
    },
    {
      q: "How fast can we ship something useful?",
      a: "We aim to deliver a first working automation quickly, then expand from there. Speed depends on how many systems we need to integrate and how clean your data is.",
    },
    {
      q: "What do you need from us?",
      a: "A clear definition of the workflow, access to the tools involved, and one person who can answer questions when edge cases pop up.",
    },
  ];

  return (
    <section className="mx-auto mt-12 max-w-6xl px-6 pb-4">
      <div className="mx-auto max-w-5xl rounded-[28px] bg-white/95 p-8 shadow-sm">
        <div className="text-center font-brand text-3xl text-brand-blue">faq</div>
        <div className="mt-2 text-center text-base text-brand-ink">Quick answers to the common questions.</div>

        <div className="mt-8 grid gap-3">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-2xl bg-[#f7f5ef] px-5 py-4">
              <summary className="cursor-pointer select-none text-base font-semibold text-zinc-900">
                {f.q}
              </summary>
              <div className="mt-2 text-sm text-zinc-700">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyChoosePurely() {
  const items = [
    {
      title: "Built around your workflow",
      desc: "We map your exact process and automate the steps that waste time and attention.",
      icon: "target" as const,
    },
    {
      title: "Integrations that actually stick",
      desc: "Connect forms, email, SMS, calendars, CRMs, and internal tools so handoffs stay consistent.",
      icon: "message" as const,
    },
    {
      title: "Fast iterations",
      desc: "Ship a useful automation quickly, then improve it based on real usage and edge cases.",
      icon: "dial" as const,
    },
    {
      title: "Clear visibility",
      desc: "Simple reporting so you can see what is working and where leads are getting stuck.",
      icon: "chart" as const,
    },
  ];

  return (
    <section className="mx-auto mt-12 max-w-6xl px-6">
      <div className="mx-auto max-w-5xl rounded-[28px] bg-white/95 p-8 shadow-sm">
        <div className="text-center font-brand text-3xl text-brand-blue">why choose purely</div>
        <div className="mt-2 text-center text-base text-brand-ink">
          Clean systems that save time and compound.
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.title} className="rounded-2xl bg-[#f7f5ef] p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl bg-brand-blue/10">
                  <FeatureIcon name={item.icon} />
                </div>
                <div>
                  <div className="text-base font-semibold text-zinc-900">{item.title}</div>
                  <div className="mt-1 text-sm text-zinc-700">{item.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatToExpect() {
  const steps = [
    {
      title: "We learn your workflow",
      desc: "A quick call to understand your steps, tools, and what needs to happen automatically.",
      icon: "phone" as const,
    },
    {
      title: "We build the first automation",
      desc: "We connect the pieces and ship a working version you can use right away.",
      icon: "dispatch" as const,
    },
    {
      title: "We refine and expand",
      desc: "We tighten edge cases, add reporting, and scale out to the next workflows.",
      icon: "chart" as const,
    },
  ];

  return (
    <section className="mx-auto mt-12 max-w-6xl px-6">
      <div className="mx-auto max-w-5xl rounded-[28px] bg-[#f7f5ef] p-8 shadow-sm">
        <div className="text-center font-brand text-3xl text-brand-blue">what to expect</div>
        <div className="mt-2 text-center text-base text-brand-ink">
          A simple process that gets results.
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-blue/10">
                <FeatureIcon name={s.icon} />
              </div>
              <div className="mt-4 text-base font-semibold text-zinc-900">{s.title}</div>
              <div className="mt-2 text-sm text-zinc-700">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatLocalDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function formatLocalMonthDay(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

function toLocalYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const mondayBased = (day + 6) % 7;
  return addDays(x, -mondayBased);
}

function seededHasAvailability(d: Date) {
  // Simple testing rule: every other day is "available".
  const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return key % 2 === 0;
}

function seededTimesForDay(d: Date) {
  const base = new Date(d);
  base.setHours(9, 0, 0, 0);
  const slots: string[] = [];
  for (let i = 0; i < 16; i++) {
    const t = new Date(base.getTime() + i * 30 * 60_000);
    slots.push(t.toISOString());
  }
  return slots;
}

function AutomationGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-transparent">
      <div className="relative mx-auto max-w-md">
        <div className="relative">
          <div className="mt-6 space-y-6">
            <div className="relative">
              <div className="h-10 w-40 rounded-xl bg-zinc-800/85" />
              <div className="absolute right-0 top-1 h-10 w-44 rounded-xl bg-zinc-800/85" />
              <svg
                className="absolute left-40 top-1 h-10 w-20"
                viewBox="0 0 100 50"
                fill="none"
              >
                <path
                  d="M10 25 L72 25"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M72 25 L58 14"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M72 25 L58 36"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="relative flex items-center gap-4">
              <div className="flex h-10 w-44 items-center rounded-xl bg-zinc-200 px-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-700" fill="currentColor">
                    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.85 21 3 13.15 3 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
                  </svg>
                </div>
              </div>
              <div className="h-10 w-44 rounded-xl bg-zinc-800/85" />

              <svg
                className="absolute left-44 top-4 h-10 w-28"
                viewBox="0 0 140 50"
                fill="none"
              >
                <path
                  d="M10 25 C55 25 55 25 96 40"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M96 40 L82 30"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M96 40 L86 48"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="relative pl-40">
              <div className="h-10 w-44 rounded-xl bg-zinc-800/85" />
              <svg
                className="absolute left-56 -top-6 h-16 w-28"
                viewBox="0 0 140 90"
                fill="none"
              >
                <path
                  d="M50 80 C100 70 105 35 106 18"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M106 18 L94 32"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d="M106 18 L118 32"
                  stroke="#fb7185"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingWidget() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const today = new Date();
    const start = startOfWeek(today);
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (seededHasAvailability(d)) return d;
    }
    return today;
  });
  const [booked, setBooked] = useState<null | { startAt: string }>(null);

  function pickFirstAvailableDay(start: Date) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (seededHasAvailability(d)) return d;
    }
    return start;
  }

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const selectedIsAvailable = seededHasAvailability(selectedDay);
  const times = useMemo(() => {
    if (!selectedIsAvailable) return [];
    return seededTimesForDay(selectedDay);
  }, [selectedDay, selectedIsAvailable]);

  return (
    <section className="mx-auto max-w-4xl rounded-[28px] bg-[#f7f5ef] p-8 shadow-sm">
      <div className="text-center font-brand text-3xl text-brand-blue">book a call</div>
      <div className="mt-2 text-center text-base text-brand-ink">
        choose a day and pick a time
      </div>

      {booked ? (
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800">
          Confirmed for {formatLocalDateTime(booked.startAt)}.
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const next = addDays(weekStart, -7);
            setWeekStart(next);
            setSelectedDay(pickFirstAvailableDay(next));
            setBooked(null);
          }}
          className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-900"
        >
          prev
        </button>
        <div className="text-sm font-semibold text-brand-ink">
          {formatLocalMonthDay(days[0])} to {formatLocalMonthDay(days[6])}
        </div>
        <button
          type="button"
          onClick={() => {
            const next = addDays(weekStart, 7);
            setWeekStart(next);
            setSelectedDay(pickFirstAvailableDay(next));
            setBooked(null);
          }}
          className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-900"
        >
          next
        </button>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-2">
        {days.map((d) => {
          const available = seededHasAvailability(d);
          const active = toLocalYmd(d) === toLocalYmd(selectedDay);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={!available}
              onClick={() => {
                setBooked(null);
                setSelectedDay(d);
              }}
              className={
                "rounded-xl px-2 py-3 text-center text-sm font-semibold transition " +
                (available
                  ? active
                    ? "bg-brand-blue text-white"
                    : "bg-white text-zinc-900 hover:bg-zinc-50"
                  : "cursor-not-allowed bg-white/50 text-zinc-400")
              }
            >
              <div>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d)}</div>
              <div className="text-lg">{d.getDate()}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <div className="text-center text-sm font-semibold text-brand-ink">times</div>
        {!selectedIsAvailable ? (
          <div className="mt-4 text-center text-sm text-zinc-700">No availability this day.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {times.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setBooked({ startAt: t })}
                className="rounded-xl bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                {formatLocalDateTime(t)}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function MarketingLanding() {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement | null>(null);
  const bookingRef = useRef<HTMLDivElement | null>(null);

  async function submit(payload: DemoRequestPayload) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/marketing/demo-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as DemoRequestResponse | { error?: string } | null;

      if (!res.ok) throw new Error((json as { error?: string } | null)?.error || "Submit failed");

      const id = (json as DemoRequestResponse).requestId;
      setRequestId(id);
      setExpanded(false);

      setTimeout(() => {
        bookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <main>
        <section className="relative z-10 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-6xl px-6 pt-10">
            <div className="py-8">
              <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
                <div>
                  <Image
                    src="/brand/purity-5.png"
                    alt="Purely Automation"
                    width={520}
                    height={180}
                    className="h-auto w-[420px] max-w-full object-contain"
                    priority
                  />
                  <p className="mt-5 max-w-md font-brand text-xl text-brand-ink md:text-2xl">
                    let your computer handle the busywork,
                    <br />
                    so you can focus on moving levers
                  </p>
                </div>

                <div className="flex justify-center md:justify-end">
                  <AutomationGraphic />
                </div>
              </div>

              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    setTimeout(() => {
                      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  className="inline-flex items-center gap-3 rounded-2xl bg-brand-pink px-7 py-4 font-brand text-xl font-bold text-brand-blue shadow-md hover:bg-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue"
                >
                  <span>see it in action</span>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white">
                    <span className="text-brand-blue">
                      <PlayMarkIcon className="h-6 w-6" />
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="bg-brand-blue py-14">
          <section ref={formRef} className="mx-auto max-w-6xl px-6">
            <div
              className={
                "mx-auto max-w-4xl overflow-hidden rounded-[28px] bg-[#f7f5ef] shadow-sm transition-all " +
                (expanded ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0")
              }
            >
              <div className="px-8 pb-10 pt-10">
                <div className="text-center font-brand text-3xl text-brand-blue">
                  we&apos;re going to send you some stuff
                </div>
                <div className="mt-2 text-center text-base text-brand-ink">let us know:</div>

                <div className="mt-10">
                  <DemoRequestForm
                    disabled={submitting || !!requestId}
                    submitting={submitting}
                    error={error}
                    onSubmit={submit}
                    onCancel={() => {
                      setExpanded(false);
                      setError(null);
                    }}
                  />

                  {requestId ? (
                    <div className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800">
                      Thanks. Your request is in.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <AutomationHighlights />

          <WhyChoosePurely />

          <section id="book" ref={bookingRef} className="mx-auto mt-12 max-w-6xl px-6">
            <BookingWidget />
          </section>

          <WhatToExpect />

          <FAQSection />
        </div>

        <footer className="pb-10">
          <div className="mx-auto max-w-6xl px-6 pt-10">
            <div className="flex flex-col items-center justify-between gap-3 border-t border-zinc-200 pt-8 text-base font-semibold text-zinc-700 sm:flex-row">
              <div>© {new Date().getFullYear()} Purely Automation. All rights reserved.</div>
              <Link className="underline underline-offset-4 hover:text-zinc-900" href="/login">
                employee? log in here
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function DemoRequestForm({
  disabled,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: DemoRequestPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Keep the API field name but match the UI from the mock.
  const [optedIn, setOptedIn] = useState(true);

  const canSubmit =
    !disabled &&
    name.trim().length > 0 &&
    company.trim().length > 0 &&
    email.trim().length > 0;

  return (
    <form
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        void onSubmit({
          name,
          company,
          email,
          phone: phone.trim() ? phone.trim() : undefined,
          optedIn,
        });
      }}
    >
      <div className="grid grid-cols-1 gap-x-16 gap-y-10 sm:grid-cols-2">
        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="name"
          />
        </label>

        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your company</span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="organization"
          />
        </label>

        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            type="email"
            autoComplete="email"
          />
        </label>

        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your phone number</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="tel"
          />
        </label>
      </div>

      <div className="grid gap-4 text-center">
        <div className="text-base font-semibold text-brand-ink">opting in for sms and email?</div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setName("");
              setCompany("");
              setEmail("");
              setPhone("");
              setOptedIn(false);
              onCancel();
            }}
            className="h-11 rounded-xl bg-zinc-800 px-6 text-sm font-semibold text-white hover:bg-zinc-900"
          >
            no, cancel demo
          </button>

          <button
            type="submit"
            disabled={!canSubmit}
            onClick={() => setOptedIn(true)}
            className={
              "h-11 rounded-xl px-6 text-sm font-semibold text-white transition " +
              (canSubmit ? "bg-brand-blue hover:bg-blue-700" : "cursor-not-allowed bg-zinc-300")
            }
          >
            {submitting ? "sending..." : "yes, send the demo"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </form>
  );
}
