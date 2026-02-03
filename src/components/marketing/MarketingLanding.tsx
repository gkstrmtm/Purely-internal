"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const OPERATING_TIME_ZONE = "America/New_York";

type SuggestedSlot = { startAt: string; endAt: string; closerCount: number };

type DemoRequestPayload = {
  name: string;
  company: string;
  email: string;
  phone: string;
  goals?: string;
  optedIn?: boolean;
};

type DemoRequestResponse = {
  requestId: string;
  leadId: string;
};

const PLAY_MARK_ICON_SRC = "/brand/play_white_removed_everywhere%20(1).png";

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
    <section id="automate" className="mx-auto mt-12 max-w-6xl scroll-mt-24 px-6">
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
    <section id="faq" className="mx-auto mt-12 max-w-6xl scroll-mt-24 px-6 pb-4">
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
    <section id="why" className="mx-auto mt-12 max-w-6xl scroll-mt-24 px-6">
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
    <section id="process" className="mx-auto mt-12 max-w-6xl scroll-mt-24 px-6">
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

function normalizePhone(inputRaw: string): { display: string; e164: string } | null {
  const input = inputRaw.trim();
  if (!input) return null;

  const hasPlus = input.startsWith("+");
  const digits = input.replace(/\D/g, "");

  // Basic sanity check: most valid numbers are 10-15 digits.
  if (digits.length < 10 || digits.length > 15) return null;

  // US-friendly formatting when user enters a 10-digit number (or 11 with leading 1).
  if (!hasPlus) {
    if (digits.length === 10) {
      return {
        display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
        e164: `+1${digits}`,
      };
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      const d = digits.slice(1);
      return {
        display: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
        e164: `+${digits}`,
      };
    }
  }

  // Fallback: keep international digits.
  return { display: `+${digits}`, e164: `+${digits}` };
}

// Note: availability is loaded from the backend suggestions API.

function getTimeZoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "your local time";
  }
}

function formatPartsInTimeZone(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const map = new Map(parts.map((p) => [p.type, p.value] as const));
  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: Number(map.get("hour")),
    minute: Number(map.get("minute")),
    second: Number(map.get("second")),
  };
}

function zonedTimeToUtc(
  input: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
) {
  // Two-pass conversion for DST correctness.
  const desiredUtcAsIf = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0);

  let guess = new Date(desiredUtcAsIf);
  for (let i = 0; i < 2; i++) {
    const p = formatPartsInTimeZone(guess, timeZone);
    const guessUtcAsIf = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = desiredUtcAsIf - guessUtcAsIf;
    guess = new Date(guess.getTime() + diff);
  }

  return guess;
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

function BookingWidget({
  initialRequestId,
  onRequestId,
  prefill,
}: {
  initialRequestId: string | null;
  onRequestId?: (id: string) => void;
  prefill?: Partial<{ name: string; company: string; email: string; phone: string; goals: string }> | null;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState(() => new Date());
  const minBookableAt = useMemo(() => new Date(now.getTime() + 30 * 60_000), [now]);

  const [slots, setSlots] = useState<SuggestedSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const slotsByLocalYmd = useMemo(() => {
    const map = new Map<string, SuggestedSlot[]>();
    for (const s of slots) {
      const key = toLocalYmd(new Date(s.startAt));
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      map.set(k, list);
    }
    return map;
  }, [slots]);

  const dayIsSelectable = useMemo(() => {
    return (d: Date) => {
      const isBeforeToday = toLocalYmd(d) < toLocalYmd(now);
      if (isBeforeToday) return false;
      const list = slotsByLocalYmd.get(toLocalYmd(d)) ?? [];
      return list.some((s) => {
        const dt = new Date(s.startAt);
        return !Number.isNaN(dt.getTime()) && dt.getTime() >= minBookableAt.getTime();
      });
    };
  }, [now, minBookableAt, slotsByLocalYmd]);

  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const today = new Date();
    return today;
  });
  const [step, setStep] = useState<"time" | "details" | "confirm">("time");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [localRequestId, setLocalRequestId] = useState<string | null>(null);
  const effectiveRequestId = localRequestId ?? initialRequestId;
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [booked, setBooked] = useState<null | { startAt: string }>(null);

  // Details (only required if user hasn't submitted the demo form)
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [goals, setGoals] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const startAt = new Date(weekStart);
        startAt.setHours(0, 0, 0, 0);

        const url = new URL("/api/public/appointments/suggestions", window.location.origin);
        url.searchParams.set("startAt", startAt.toISOString());
        url.searchParams.set("days", "7");
        url.searchParams.set("durationMinutes", "30");
        url.searchParams.set("limit", "50");

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { slots?: SuggestedSlot[]; error?: string } | null;

        if (!res.ok) throw new Error(json?.error || "Unable to load availability.");
        const nextSlots = Array.isArray(json?.slots) ? json!.slots! : [];
        if (!cancelled) setSlots(nextSlots);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unable to load availability.";
        if (!cancelled) {
          setSlots([]);
          setSlotsError(msg);
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  useEffect(() => {
    // If the currently-selected day becomes invalid (time passed), move forward.
    if (dayIsSelectable(selectedDay)) return;
    for (let i = 0; i < 14; i++) {
      const d = addDays(startOfWeek(now), i);
      if (dayIsSelectable(d)) {
        setSelectedDay(d);
        setWeekStart(startOfWeek(d));
        break;
      }
    }
  }, [now, dayIsSelectable, selectedDay]);

  useEffect(() => {
    if (step !== "details") return;

    if (!name.trim() && prefill?.name) setName(prefill.name);
    if (!company.trim() && prefill?.company) setCompany(prefill.company);
    if (!email.trim() && prefill?.email) setEmail(prefill.email);
    if (!phone.trim() && prefill?.phone) setPhone(prefill.phone);
    if (!goals.trim() && prefill?.goals) setGoals(prefill.goals);
  }, [step, prefill, name, company, email, phone, goals]);

  function pickFirstAvailableDay(start: Date) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (dayIsSelectable(d)) return d;
    }
    return start;
  }

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const times = useMemo(() => {
    const list = slotsByLocalYmd.get(toLocalYmd(selectedDay)) ?? [];
    return list.map((s) => s.startAt);
  }, [selectedDay, slotsByLocalYmd]);

  const selectedIsAvailable = times.length > 0;

  const userTimeZone = useMemo(() => getTimeZoneLabel(), []);

  async function createDemoRequestIfNeeded() {
    if (effectiveRequestId) return effectiveRequestId;

    // Basic native-like validation (we still rely on required inputs)
    if (!name.trim() || !company.trim() || !email.trim() || !phone.trim()) {
      throw new Error("Please fill out all required fields.");
    }

    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error("Please enter a valid phone number.");
    setPhone(normalized.display);
    setPhoneE164(normalized.e164);

    const res = await fetch("/api/marketing/demo-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        company: company.trim(),
        email: email.trim(),
        phone: normalized.e164,
        goals: goals.trim() ? goals.trim() : undefined,
        // Per your request: we reach out via email + SMS.
        optedIn: true,
      } satisfies DemoRequestPayload),
    });

    const json = (await res.json().catch(() => null)) as DemoRequestResponse | { error?: string } | null;
    if (!res.ok) {
      const msg = (json as { error?: string } | null)?.error || "Please check your details and try again.";
      throw new Error(msg);
    }

    const id = (json as DemoRequestResponse).requestId;
    setLocalRequestId(id);
    onRequestId?.(id);
    return id;
  }

  async function bookSelectedTime(requestId: string) {
    if (!selectedTime) throw new Error("Please pick a time.");

    const res = await fetch("/api/public/appointments/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, startAt: selectedTime, durationMinutes: 30 }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string; appointment?: unknown } | null;
    if (!res.ok) {
      if (res.status === 404) throw new Error("We could not find your request. Please try again.");
      if (res.status === 409) {
        throw new Error("That time just became unavailable. Please choose a different time.");
      }
      throw new Error(json?.error || "We could not book that time. Please try again.");
    }

    setBooked({ startAt: selectedTime });
    setStep("confirm");
  }

  async function handlePrimaryAction() {
    setUiError(null);
    if (!selectedTime) {
      setUiError("Please select a time first.");
      return;
    }

    setStep("details");
  }

  async function handleSubmitDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setUiError(null);

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (!selectedTime) {
      setUiError("Please select a time first.");
      setStep("time");
      return;
    }

    setBusy(true);
    try {
      const id = effectiveRequestId ?? (await createDemoRequestIfNeeded());
      await bookSelectedTime(id);
    } catch (e) {
      setUiError(e instanceof Error ? e.message : "Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  const timeItems = useMemo(() => {
    return times.map((t) => {
      const dt = new Date(t);
      const disabled = Number.isNaN(dt.getTime()) || dt.getTime() < minBookableAt.getTime();
      return { t, disabled };
    });
  }, [times, minBookableAt]);

  useEffect(() => {
    if (!selectedTime) return;
    const dt = new Date(selectedTime);
    if (!Number.isNaN(dt.getTime()) && dt.getTime() < minBookableAt.getTime()) {
      setSelectedTime(null);
    }
  }, [selectedTime, minBookableAt]);

  return (
    <section className="mx-auto max-w-4xl rounded-[28px] bg-[#f7f5ef] p-8 shadow-sm">
      <div className="text-center font-brand text-3xl text-brand-blue">book a call</div>
      <div className="mt-2 text-center text-base text-brand-ink">
        choose a day and pick a time
      </div>

      <div className="mt-2 text-center text-xs text-zinc-600">
        Times are shown in your local time ({userTimeZone}).
      </div>

      {slotsError ? (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
          {slotsError}
        </div>
      ) : null}

      {uiError ? (
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
          {uiError}
        </div>
      ) : null}

      {step === "confirm" && booked ? (
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800">
          Thanks for booking. You were just sent an email with instructions on how to join the video call.
          <div className="mt-1 font-semibold">{formatLocalDateTime(booked.startAt)}</div>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setBooked(null);
                setSelectedTime(null);
                setUiError(null);
                setBusy(false);
                setStep("time");
              }}
              className="h-10 rounded-xl bg-zinc-800 px-5 text-sm font-semibold text-white hover:bg-zinc-900"
            >
              book another time
            </button>
          </div>
        </div>
      ) : null}

      {step === "details" ? (
        <div className="mx-auto mt-8 max-w-2xl">
          <div className="text-center text-sm font-semibold text-brand-ink">step 2 of 2</div>
          <div className="mt-2 text-center font-brand text-2xl text-brand-blue">tell us who you are</div>
          <div className="mt-2 text-center text-sm text-zinc-700">
            We will reach out by email and text.
          </div>

          <form className="mt-6 grid gap-4" autoComplete="on" onSubmit={handleSubmitDetails}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">name</span>
                <input
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  disabled={busy}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">company</span>
                <input
                  name="organization"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  required
                  autoComplete="organization"
                  disabled={busy}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">email</span>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  disabled={busy}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-brand-ink">phone</span>
                <input
                  name="tel"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneE164(null);
                  }}
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={busy}
                  onBlur={(e) => {
                    const raw = e.currentTarget.value;
                    if (!raw.trim()) return;
                    const normalized = normalizePhone(raw);
                    if (!normalized) {
                      e.currentTarget.setCustomValidity("Please enter a valid phone number.");
                      return;
                    }
                    e.currentTarget.setCustomValidity("");
                    setPhone(normalized.display);
                    setPhoneE164(normalized.e164);
                  }}
                  onInvalid={(e) => e.currentTarget.setCustomValidity("Please enter a valid phone number.")}
                  onInput={(e) => e.currentTarget.setCustomValidity("")}
                  className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-brand-ink">what do you want automated</span>
              <input
                name="goals"
                list="automation-goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                disabled={busy}
                className="h-11 rounded-xl border-2 border-zinc-800 bg-white px-3 text-sm font-semibold text-zinc-900"
                placeholder="Choose one or type your own"
              />
              <datalist id="automation-goals">
                <option value="Inbound calls, SMS, and email routing" />
                <option value="Lead follow up and conversion" />
                <option value="Scheduling and appointment booking" />
                <option value="Dispatching teams and contractors" />
                <option value="Newsletters and announcements" />
                <option value="Dashboards and reporting" />
                <option value="Outbound acquisition" />
                <option value="Social media marketing workflows" />
              </datalist>
            </label>

            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep("time")}
                disabled={busy}
                className="h-11 rounded-xl bg-zinc-800 px-5 text-sm font-semibold text-white hover:bg-zinc-900"
              >
                back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-11 rounded-xl bg-brand-blue px-6 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {busy ? "booking..." : "book"}
              </button>
            </div>

            {/* Keep phone normalized for submission even if user doesn't blur */}
            {phoneE164 ? <input type="hidden" name="phoneE164" value={phoneE164} readOnly /> : null}
          </form>
        </div>
      ) : null}

      {step === "time" ? (
        <>
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const next = addDays(weekStart, -7);
            setWeekStart(next);
            setSelectedDay(next);
            setSelectedTime(null);
            setBooked(null);
            setStep("time");
          }}
          className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-900"
        >
          last week
        </button>
        <div className="text-sm font-semibold text-brand-ink">
          {formatLocalMonthDay(days[0])} to {formatLocalMonthDay(days[6])}
        </div>
        <button
          type="button"
          onClick={() => {
            const next = addDays(weekStart, 7);
            setWeekStart(next);
            setSelectedDay(next);
            setSelectedTime(null);
            setBooked(null);
            setStep("time");
          }}
          className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-900"
        >
          next week
        </button>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-2">
        {days.map((d) => {
          const isBeforeToday = toLocalYmd(d) < toLocalYmd(now);
          const list = slotsByLocalYmd.get(toLocalYmd(d)) ?? [];
          const hasFutureSlot = list.some((s) => {
            const dt = new Date(s.startAt);
            return !Number.isNaN(dt.getTime()) && dt.getTime() >= minBookableAt.getTime();
          });
          const available = !isBeforeToday && hasFutureSlot;
          const active = toLocalYmd(d) === toLocalYmd(selectedDay);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={!available}
              onClick={() => {
                setBooked(null);
                setSelectedDay(d);
                setSelectedTime(null);
                setStep("time");
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
        {slotsLoading ? (
          <div className="mt-4 text-center text-sm text-zinc-700">Loading availability…</div>
        ) : null}
        {!selectedIsAvailable ? (
          <div className="mt-4 text-center text-sm text-zinc-700">No availability this day.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {timeItems.map(({ t, disabled }) => (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setSelectedTime(t);
                  setUiError(null);
                }}
                className={
                  "rounded-xl px-4 py-3 text-left text-sm font-semibold transition " +
                  (disabled
                    ? "cursor-not-allowed bg-white/50 text-zinc-400"
                    : selectedTime === t
                      ? "bg-brand-blue text-white"
                      : "bg-white text-zinc-900 hover:bg-zinc-50")
                }
              >
                {formatLocalDateTime(t)}
              </button>
            ))}
          </div>
        )}

        {step === "time" ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              disabled={busy || !selectedTime}
              onClick={() => void handlePrimaryAction()}
              className={
                "h-11 rounded-xl px-8 text-sm font-semibold text-white transition " +
                (!selectedTime || busy ? "cursor-not-allowed bg-zinc-300" : "bg-brand-blue hover:bg-blue-700")
              }
            >
              next
            </button>
          </div>
        ) : null}
      </div>
        </>
      ) : null}
    </section>
  );
}

export function MarketingLanding() {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefill, setPrefill] = useState<null | {
    name: string;
    company: string;
    email: string;
    phone: string;
    goals?: string;
  }>(null);

  const formRef = useRef<HTMLDivElement | null>(null);
  const bookingRef = useRef<HTMLDivElement | null>(null);

  function scrollToCalendar() {
    const el = bookingRef.current;
    if (!el) return;
    const y = window.scrollY + el.getBoundingClientRect().top - 16;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

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
      setPrefill({
        name: payload.name,
        company: payload.company,
        email: payload.email,
        phone: payload.phone,
        goals: payload.goals,
      });
      setExpanded(false);

      // Wait for the form collapse transition/layout to settle, then scroll precisely.
      setTimeout(() => {
        scrollToCalendar();
        setTimeout(scrollToCalendar, 250);
      }, 350);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      if (/invalid payload|zod|prisma|error code/i.test(msg)) {
        setError("Please check your details and try again.");
      } else {
        setError(msg || "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header className="fixed left-0 right-0 top-0 z-50 bg-brand-blue/55 shadow-md backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/Untitled%20design%20(6).png"
              alt="Purely Automation"
              width={40}
              height={40}
              className="h-9 w-9 object-contain"
              priority
            />
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-full w-64 overflow-hidden rounded-b-2xl bg-brand-blue/95 shadow-lg ring-1 ring-white/15">
                <nav className="grid border-t border-white/15">
                  {[
                    { href: "#top", label: "top" },
                    { href: "#demo", label: "see it in action" },
                    { href: "#automate", label: "what we automate" },
                    { href: "#why", label: "why choose purely" },
                    { href: "#book", label: "book a call" },
                    { href: "#process", label: "what to expect" },
                    { href: "#faq", label: "faq" },
                  ].map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-3 text-sm font-semibold text-white/95 hover:bg-white/10"
                    >
                      {item.label}
                    </a>
                  ))}

                  <div className="h-px bg-white/15" />

                  <Link
                    href="/blogs"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-3 text-sm font-semibold text-white/95 hover:bg-white/10"
                  >
                    automated blogs
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-3 text-sm font-semibold text-white/95 hover:bg-white/10"
                  >
                    employee login
                  </Link>
                </nav>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main id="top">
        {/* spacer bar so header feels solid at top */}
        <div aria-hidden className="h-14 bg-brand-blue" />
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
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-transparent">
                    <Image src={PLAY_MARK_ICON_SRC} alt="" width={24} height={24} className="h-6 w-6" priority />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="bg-brand-blue py-14">
          <section id="demo" ref={formRef} className="mx-auto max-w-6xl scroll-mt-24 px-6">
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
                      Check your email and recent texts. We just reached out.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <AutomationHighlights />

          <WhyChoosePurely />

          <section id="book" ref={bookingRef} className="mx-auto mt-12 max-w-6xl scroll-mt-24 px-6">
            <BookingWidget
              initialRequestId={requestId}
              onRequestId={(id) => setRequestId(id)}
              prefill={prefill}
            />
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
    email.trim().length > 0 &&
    phone.trim().length > 0;

  return (
    <form
      className="grid gap-10"
      autoComplete="on"
      onSubmit={(e) => {
        const form = e.currentTarget;
        e.preventDefault();

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        if (!canSubmit) return;

        const normalized = normalizePhone(phone);
        if (!normalized) {
          const input = form.querySelector<HTMLInputElement>("input[name='tel']");
          input?.setCustomValidity("Please enter a valid phone number.");
          form.reportValidity();
          input?.focus();
          return;
        }

        setPhone(normalized.display);

        const finalPhone = normalized.e164;

        void onSubmit({
          name: name.trim(),
          company: company.trim(),
          email: email.trim(),
          phone: finalPhone.trim(),
          optedIn,
        });
      }}
    >
      <div className="grid grid-cols-1 gap-x-16 gap-y-10 sm:grid-cols-2">
        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your name</span>
          <input
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="name"
            required
            onInvalid={(e) => e.currentTarget.setCustomValidity("Please enter your name.")}
            onInput={(e) => e.currentTarget.setCustomValidity("")}
          />
        </label>

        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your company</span>
          <input
            name="organization"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            autoComplete="organization"
            required
            onInvalid={(e) => e.currentTarget.setCustomValidity("Please enter your company name.")}
            onInput={(e) => e.currentTarget.setCustomValidity("")}
          />
        </label>

        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your email</span>
          <input
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
            onInvalid={(e) => e.currentTarget.setCustomValidity("Please enter a valid email address.")}
            onInput={(e) => e.currentTarget.setCustomValidity("")}
          />
        </label>

        <label className="grid gap-3">
          <span className="text-sm font-semibold text-brand-ink">your phone number</span>
          <input
            name="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
            }}
            disabled={disabled}
            className="h-12 rounded-lg border-2 border-zinc-800 bg-[#a9bdf0] px-4 text-base font-semibold text-zinc-900 placeholder:text-zinc-700"
            placeholder=""
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            onBlur={(e) => {
              const raw = e.currentTarget.value;
              if (!raw.trim()) return;
              const normalized = normalizePhone(raw);
              if (!normalized) {
                e.currentTarget.setCustomValidity("Please enter a valid phone number.");
                return;
              }

              e.currentTarget.setCustomValidity("");
              setPhone(normalized.display);
            }}
            onInvalid={(e) => {
              e.currentTarget.setCustomValidity("Please enter a valid phone number.");
            }}
            onInput={(e) => e.currentTarget.setCustomValidity("")}
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
