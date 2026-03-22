"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PORTAL_MODULE_CATALOG, type PortalModuleKey } from "@/lib/portalModulesCatalog";

type Mode = "monthly" | "credit" | "combined";

const MRR_PRESETS = [25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000] as const;
const MONTH_PRESETS = [1, 3, 6, 12] as const;
const MAX_MONTHS = 60;

const GROWTH_PRESETS_PCT = [0, 10, 20, 40] as const;
const GROWTH_MIN_PCT = -50;
const GROWTH_MAX_PCT = 200;

const KEEP_PRESETS = [0.85, 0.9] as const;
const KEEP_DEFAULT = 0.88;
const KEEP_MIN = 0.7;
const KEEP_MAX = 0.92;

const ARPU_DEFAULT_MONTHLY = 606;
const ARPU_DEFAULT_CREDIT = 800;
const ARPU_WHALE = 2500;

const DEFAULT_USD_PER_CREDIT_SUBSCRIPTION = 0.1;
const DEFAULT_USD_PER_CREDIT_CREDITS_ONLY = 0.2;

type AovSource = "modules" | "manual";

type ModulePctMap = Record<PortalModuleKey, number>; // 0..100
type ModuleUsdMap = Record<PortalModuleKey, number>; // USD per enabled customer per month

const DEFAULT_MODULE_ADOPTION_PCT: ModulePctMap = {
  blog: 55,
  booking: 70,
  automations: 35,
  reviews: 60,
  newsletter: 35,
  nurture: 20,
  aiReceptionist: 45,
  leadScraping: 40,
  leadOutbound: 25,
  crm: 0,
};

const DEFAULT_VALUE_USD_PER_ENABLED_CUSTOMER: ModuleUsdMap = {
  blog: 300,
  booking: 150,
  automations: 200,
  reviews: 500,
  newsletter: 250,
  nurture: 200,
  aiReceptionist: 900,
  leadScraping: 600,
  leadOutbound: 1200,
  crm: 150,
};

type RoiServiceDefaults = {
  creditsPerMonth: number;
  extraRevenueUsdPerMonth: number;
  hoursSavedPerMonth: number;
};

type RoiServiceRationale = {
  credits: string[];
  revenue: string[];
  hours: string[];
};

const ROI_DEFAULTS_BY_SERVICE: Partial<Record<PortalModuleKey, RoiServiceDefaults>> = {
  // These are intentionally rough heuristics used for the visualizer.
  blog: { creditsPerMonth: 20, extraRevenueUsdPerMonth: 300, hoursSavedPerMonth: 1 },
  booking: { creditsPerMonth: 25, extraRevenueUsdPerMonth: 600, hoursSavedPerMonth: 2 },
  automations: { creditsPerMonth: 50, extraRevenueUsdPerMonth: 250, hoursSavedPerMonth: 2 },
  reviews: { creditsPerMonth: 10, extraRevenueUsdPerMonth: 450, hoursSavedPerMonth: 1 },
  newsletter: { creditsPerMonth: 30, extraRevenueUsdPerMonth: 200, hoursSavedPerMonth: 1 },
  nurture: { creditsPerMonth: 40, extraRevenueUsdPerMonth: 350, hoursSavedPerMonth: 1.5 },
  aiReceptionist: { creditsPerMonth: 250, extraRevenueUsdPerMonth: 1200, hoursSavedPerMonth: 6 },
  leadScraping: { creditsPerMonth: 180, extraRevenueUsdPerMonth: 1500, hoursSavedPerMonth: 2.5 },
  leadOutbound: { creditsPerMonth: 220, extraRevenueUsdPerMonth: 2000, hoursSavedPerMonth: 3 },
  crm: { creditsPerMonth: 10, extraRevenueUsdPerMonth: 150, hoursSavedPerMonth: 1 },
};

const ROI_RATIONALE_BY_SERVICE: Partial<Record<PortalModuleKey, RoiServiceRationale>> = {
  blog: {
    credits: [
      "AI drafts + edits multiple posts/month (outlines, writing, images/meta) and occasionally rewrites/refreshes older pages.",
      "Credits here are a proxy for content generation + optimization work that would otherwise be done by staff or an agency.",
    ],
    revenue: [
      "The $300/mo lift assumes content creates a small but steady increase in inbound leads (local SEO + long-tail queries).",
      "A conservative mental model: even 1 additional booked job every 1-3 months (depending on AOV) can justify a few hundred dollars of incremental revenue.",
    ],
    hours: [
      "Hours saved comes from eliminating writing, formatting, internal reviews, and posting steps for the owner/staff.",
    ],
  },
  booking: {
    credits: [
      "Credits cover automated messages (confirmations/reminders) and any AI text used to customize scheduling flows.",
      "Booking systems tend to generate small but frequent credit events (reminders, reschedules, follow-ups).",
    ],
    revenue: [
      "Revenue lift comes from fewer missed leads (after-hours capture) and fewer no-shows via reminders.",
      "The $600/mo assumption is roughly: a couple of saved appointments or one extra closed job per month.",
    ],
    hours: [
      "Time saved is mainly scheduling back-and-forth (calls/texts), reschedules, and sending reminders manually.",
    ],
  },
  automations: {
    credits: [
      "Automations spend credits on message generation + personalization across multiple touchpoints (SMS/email) and trigger-based workflows.",
      "They look ‘credit-heavy’ because they run every day across many small events (new lead, missed call, form fill, no-response follow-up).",
    ],
    revenue: [
      "Revenue lift is modeled as ‘leads that would have gone cold now get an extra touch’ → slightly higher appointment/close rate.",
      "The $250/mo number is intentionally modest because it assumes only a small conversion bump, not a full pipeline overhaul.",
    ],
    hours: [
      "Hours saved is fewer manual follow-ups, fewer ‘did we respond?’ checks, and fewer copy/paste messages.",
    ],
  },
  reviews: {
    credits: [
      "Credits are mostly review request + reminder messages and optional AI replies/triage.",
    ],
    revenue: [
      "Revenue lift is driven by trust: better review velocity and response rates tend to increase conversion from existing website/GBP traffic.",
      "The $450/mo assumption is a conservative conversion-rate improvement on already-existing lead volume.",
    ],
    hours: [
      "Time saved is not chasing reviews manually and not writing/approving replies one-by-one.",
    ],
  },
  newsletter: {
    credits: [
      "Credits represent ongoing content drafting + segmentation/personalization work (subject lines, sections, CTAs).",
    ],
    revenue: [
      "Revenue lift assumes occasional reactivation and repeat business from a warmed list.",
      "At $200/mo, the model is ‘a small number of repeat purchases spread across the month’.",
    ],
    hours: [
      "Hours saved is the owner/staff not having to plan, write, format, and schedule a newsletter.",
    ],
  },
  nurture: {
    credits: [
      "Nurture sequences run multiple messages per lead across days/weeks; each message can incur credits for generation/personalization.",
    ],
    revenue: [
      "Revenue lift assumes improved close rate from consistent follow-up and better ‘speed to lead’.",
      "$350/mo is modeled as a small uplift across the funnel rather than a single big win.",
    ],
    hours: [
      "Hours saved is fewer manual follow-ups and less pipeline babysitting.",
    ],
  },
  aiReceptionist: {
    credits: [
      "This is intentionally one of the most credit-intensive services: calls generate transcription + reasoning + summaries, and can include tool calls (booking, FAQs, routing).",
      "A rough mental model: a few calls/day × minutes/call adds up quickly even when individual calls are cheap.",
    ],
    revenue: [
      "Revenue lift is primarily ‘captured opportunities’: answered after-hours, fewer missed calls, and better lead qualification/booking.",
      "$1,200/mo is conservative if the business has meaningful inbound calls; it can be as simple as 1-3 extra booked jobs/month depending on AOV.",
    ],
    hours: [
      "Hours saved is time not spent answering repetitive calls, collecting details, and writing summaries.",
    ],
  },
  leadScraping: {
    credits: [
      "Credits represent enrichment work: collecting lead lists, cleaning/normalizing, deduping, and generating notes/segments.",
      "It’s ‘credit heavy’ because it processes many records even if only a fraction convert.",
    ],
    revenue: [
      "Revenue lift assumes a small number of additional qualified leads per month and a conservative close rate.",
      "$1,500/mo can be modeled as: a handful of incremental appointments with 10-30% close rate at typical SMB ticket sizes.",
    ],
    hours: [
      "Hours saved is not manually building lists, copying data, and researching prospects.",
    ],
  },
  leadOutbound: {
    credits: [
      "Outbound spends credits on personalization at scale (first lines, offers, follow-up sequences) and reply handling/triage.",
      "If it runs weekly with multiple touches per prospect, credits accumulate fast by design.",
    ],
    revenue: [
      "Revenue lift assumes incremental pipeline created from outbound (new conversations → booked appointments → closes).",
      "$2,000/mo is a ‘small pipeline’ assumption: a few extra deals per quarter or 1 extra deal/month depending on ticket size.",
    ],
    hours: [
      "Hours saved is prospecting + message writing + follow-ups that would otherwise be manual.",
    ],
  },
  crm: {
    credits: [
      "Credits represent AI help for notes, summaries, and occasional data cleanup/enrichment.",
    ],
    revenue: [
      "Revenue lift is modeled as fewer dropped balls (better tracking, reminders, follow-ups), typically a small uplift.",
    ],
    hours: [
      "Hours saved is less admin time logging notes and updating records.",
    ],
  },
};

type ServiceMixPresetKey = "Lean" | "Standard" | "Aggressive" | "All-in";

const SERVICE_MIX_PRESETS: Record<
  ServiceMixPresetKey,
  { adoptionPct: ModulePctMap; creditsPerMonthlyCustomer: number; creditsPerCreditCustomer: number }
> = {
  Lean: {
    adoptionPct: {
      blog: 35,
      booking: 55,
      automations: 20,
      reviews: 35,
      newsletter: 20,
      nurture: 10,
      aiReceptionist: 25,
      leadScraping: 20,
      leadOutbound: 10,
      crm: 0,
    },
    creditsPerMonthlyCustomer: 60,
    creditsPerCreditCustomer: 120,
  },
  Standard: {
    adoptionPct: DEFAULT_MODULE_ADOPTION_PCT,
    creditsPerMonthlyCustomer: 100,
    creditsPerCreditCustomer: 200,
  },
  Aggressive: {
    adoptionPct: {
      blog: 75,
      booking: 85,
      automations: 60,
      reviews: 75,
      newsletter: 60,
      nurture: 40,
      aiReceptionist: 70,
      leadScraping: 65,
      leadOutbound: 55,
      crm: 0,
    },
    creditsPerMonthlyCustomer: 160,
    creditsPerCreditCustomer: 280,
  },
  "All-in": {
    adoptionPct: {
      blog: 100,
      booking: 100,
      automations: 100,
      reviews: 100,
      newsletter: 100,
      nurture: 100,
      aiReceptionist: 100,
      leadScraping: 100,
      leadOutbound: 100,
      crm: 0,
    },
    creditsPerMonthlyCustomer: 220,
    creditsPerCreditCustomer: 350,
  },
};

function clampNum(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function ceilDiv(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.ceil(n / d);
}

function round(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function formatMoneyCompact(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatKeep(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function formatPct1(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `${Math.round(v * 1000) / 10}%`;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function calcProfitPerMonth(mrr: number, keep: number) {
  return mrr * keep;
}

function sum(ns: number[]) {
  let s = 0;
  for (const n of ns) s += Number.isFinite(n) ? n : 0;
  return s;
}

function cumulative(ns: number[]) {
  const out: number[] = [];
  let s = 0;
  for (const n of ns) {
    s += Number.isFinite(n) ? n : 0;
    out.push(s);
  }
  return out;
}

function customersNeeded(opts: {
  mrr: number;
  mode: Mode;
  monthlyArpu: number;
  creditArpu: number;
  monthlyShare: number; // 0..1
}) {
  const mrr = opts.mrr;
  const monthlyArpu = opts.monthlyArpu;
  const creditArpu = opts.creditArpu;

  if (opts.mode === "monthly") {
    const customers = ceilDiv(mrr, monthlyArpu);
    return { customers, monthlyCustomers: customers, creditCustomers: 0 };
  }

  if (opts.mode === "credit") {
    const customers = ceilDiv(mrr, creditArpu);
    return { customers, monthlyCustomers: 0, creditCustomers: customers };
  }

  const monthlyShare = clampNum(opts.monthlyShare, 0, 1);
  const creditShare = 1 - monthlyShare;
  const blendedArpu = monthlyShare * monthlyArpu + creditShare * creditArpu;
  const customers = ceilDiv(mrr, blendedArpu);
  const monthlyCustomers = round(customers * monthlyShare);
  const creditCustomers = Math.max(0, customers - monthlyCustomers);
  return { customers, monthlyCustomers, creditCustomers };
}

type UserSimMix = "credits-heavy" | "balanced" | "membership-heavy";
type UserSimPlan = "membership" | "credits";

type SimUser = {
  idx: number; // 1-based
  plan: UserSimPlan;
  modules: PortalModuleKey[];
  creditsByModule: Partial<Record<PortalModuleKey, number>>;
  creditsPerMonth: number;
  subscriptionUsd: number;
  creditsUsd: number;
  totalUsd: number;
};

function rngMulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(parts: Array<string | number>) {
  const s = parts.map((p) => String(p)).join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickWeighted<T>(rng: () => number, items: Array<{ item: T; w: number }>): T {
  const total = sum(items.map((x) => Math.max(0, x.w)));
  if (total <= 0) return items[0]!.item;
  let r = rng() * total;
  for (const x of items) {
    const w = Math.max(0, x.w);
    if (w <= 0) continue;
    if (r <= w) return x.item;
    r -= w;
  }
  return items[items.length - 1]!.item;
}

function clampInt(n: number, min: number, max: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function simulateUsers(opts: {
  count: number;
  seed: number;
  mix: UserSimMix;
  moduleAdoptionPct: ModulePctMap;
  usdPerCreditSubscription: number;
  usdPerCreditCreditsOnly: number;
}): SimUser[] {
  const count = clampInt(opts.count, 1, 500);
  const seed = Number.isFinite(opts.seed) ? Math.floor(opts.seed) : 1;

  const creditOnlyShare =
    opts.mix === "credits-heavy" ? 0.72 : opts.mix === "membership-heavy" ? 0.35 : 0.55;

  const moduleKeys = (Object.keys(PORTAL_MODULE_CATALOG) as PortalModuleKey[]).filter((k) => k !== "crm");
  const coreKeys: PortalModuleKey[] = ["booking", "reviews", "aiReceptionist"];
  const usageDrivers: PortalModuleKey[] = ["aiReceptionist", "leadScraping", "leadOutbound", "blog", "newsletter", "nurture", "automations", "booking", "reviews"];

  const out: SimUser[] = [];
  for (let i = 1; i <= count; i += 1) {
    const rng = rngMulberry32(hashSeed([seed, i]));
    const plan: UserSimPlan = rng() < creditOnlyShare ? "credits" : "membership";

    // Build a realistic per-user module set.
    // - Always biased toward easy starters (booking/reviews) and high-leverage services (AI receptionist/outbound).
    const modulesSet = new Set<PortalModuleKey>();
    const minModules = plan === "membership" ? (rng() < 0.55 ? 2 : 1) : 0;
    const maxModules = plan === "membership" ? 5 : 3;

    if (plan === "membership") {
      // Core defaults (starter-friendly)
      if (rng() < 0.75) modulesSet.add("booking");
      if (rng() < 0.70) modulesSet.add("reviews");

      // Probabilistic adoption (uses the dashboard preset as the baseline)
      for (const k of moduleKeys) {
        const pct = clampNum(opts.moduleAdoptionPct[k] ?? 0, 0, 100) / 100;
        const tilt =
          k === "leadOutbound" || k === "aiReceptionist" || k === "leadScraping"
            ? 1.15
            : k === "booking" || k === "reviews"
              ? 1.05
              : 1;
        const p = clampNum(pct * tilt, 0, 0.98);
        if (rng() < p) modulesSet.add(k);
      }

      // Ensure at least one core module.
      if (![...modulesSet].some((m) => coreKeys.includes(m))) {
        modulesSet.add(pickWeighted(rng, coreKeys.map((k) => ({ item: k, w: PORTAL_MODULE_CATALOG[k].monthlyUsd + 20 }))));
      }

      // Clamp module count for readability.
      while (modulesSet.size > maxModules) {
        const xs = Array.from(modulesSet);
        const drop = pickWeighted(rng, xs.map((k) => ({ item: k, w: 1 / Math.max(1, PORTAL_MODULE_CATALOG[k].monthlyUsd) })));
        modulesSet.delete(drop);
      }
      while (modulesSet.size < minModules) {
        const add = pickWeighted(rng, moduleKeys.map((k) => ({ item: k, w: (opts.moduleAdoptionPct[k] ?? 0) + 10 })));
        modulesSet.add(add);
      }
    } else {
      // Credits-only users: model them as usage-first.
      const picks = rng() < 0.65 ? 2 : 1;
      for (let n = 0; n < picks; n += 1) {
        const k = pickWeighted(
          rng,
          usageDrivers.map((m) => ({
            item: m,
            w:
              m === "leadOutbound"
                ? 5
                : m === "aiReceptionist"
                  ? 4.5
                  : m === "leadScraping"
                    ? 3.5
                    : m === "booking" || m === "reviews"
                      ? 2.4
                      : 2,
          })),
        );
        modulesSet.add(k);
      }
    }

    const modules = Array.from(modulesSet);
    const subscriptionUsd = plan === "membership" ? sum(modules.map((k) => PORTAL_MODULE_CATALOG[k]?.monthlyUsd ?? 0)) : 0;

    // Credits: sum per-service defaults with slight per-user randomness.
    const creditRate = plan === "membership" ? opts.usdPerCreditSubscription : opts.usdPerCreditCreditsOnly;
    const creditScale = clampNum(0.65 + rng() * 0.95, 0.35, 2.0);
    const creditsByModule: Partial<Record<PortalModuleKey, number>> = {};
    for (const k of modules) {
      const base = ROI_DEFAULTS_BY_SERVICE[k]?.creditsPerMonth ?? 0;
      if (!Number.isFinite(base) || base <= 0) continue;
      const variability = clampNum(0.75 + rng() * 0.6, 0.4, 1.8);
      const credits = Math.max(0, Math.round(base * variability * creditScale));
      if (credits > 0) creditsByModule[k] = credits;
    }
    const creditsPerMonth = sum(Object.values(creditsByModule));
    const creditsUsd = Math.max(0, creditsPerMonth) * Math.max(0, creditRate);
    const totalUsd = subscriptionUsd + creditsUsd;

    out.push({
      idx: i,
      plan,
      modules,
      creditsByModule,
      creditsPerMonth,
      subscriptionUsd,
      creditsUsd,
      totalUsd,
    });
  }

  return out;
}

function SegButton(props: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={classNames(
        "h-10 rounded-2xl px-4 text-sm font-semibold transition",
        props.active
          ? "bg-[color:var(--color-brand-ink)] text-white"
          : "bg-white text-zinc-800 hover:bg-zinc-50",
      )}
    >
      {props.children}
    </button>
  );
}

function SurfaceCard(props: {
  title: string;
  value: string;
  sub?: string;
  accent?: "blue" | "pink" | "ink";
}) {
  const accentClass =
    props.accent === "pink"
      ? "from-[color:var(--color-brand-pink)]/30"
      : props.accent === "ink"
        ? "from-[color:var(--color-brand-ink)]/25"
        : "from-[color:var(--color-brand-blue)]/30";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className={classNames("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", accentClass, "to-transparent")} />
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{props.title}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">{props.value}</div>
      {props.sub ? <div className="mt-1 text-xs text-zinc-600">{props.sub}</div> : null}
    </div>
  );
}

function HoverSparkArea(props: {
  values: number[];
  stroke?: string;
  height?: number;
  onHoverIndex?: (idx: number | null) => void;
}) {
  const height = props.height ?? 96;
  const width = 320;
  const stroke = props.stroke ?? "var(--color-brand-blue)";
  const gid = useId();

  const shape = useMemo(() => {
    const vals = props.values.length ? props.values : [0];
    const max = Math.max(1, ...vals);
    const min = Math.min(0, ...vals);
    const span = Math.max(1, max - min);
    const stepX = vals.length <= 1 ? 0 : width / (vals.length - 1);

    const pts = vals.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return { x, y };
    });

    const line = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const area = `M 0 ${height} L ${line} L ${width} ${height} Z`;
    return { pts, line, area, stepX };
  }, [props.values, height]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function setIdx(idx: number | null) {
    setHoverIdx(idx);
    props.onHoverIndex?.(idx);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      aria-hidden
      onMouseLeave={() => setIdx(null)}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const x = clampNum(e.clientX - rect.left, 0, rect.width);
        const t = rect.width > 0 ? x / rect.width : 0;
        const idx = Math.round(t * Math.max(0, shape.pts.length - 1));
        setIdx(clampNum(idx, 0, Math.max(0, shape.pts.length - 1)));
      }}
    >
      <defs>
        <linearGradient id={`profitArea-${gid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <path d={shape.area} fill={`url(#profitArea-${gid})`} />
      <polyline points={shape.line} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

      {typeof hoverIdx === "number" && shape.pts[hoverIdx] ? (
        <g>
          <line x1={shape.pts[hoverIdx].x} x2={shape.pts[hoverIdx].x} y1={0} y2={height} stroke="rgba(15,23,42,0.12)" strokeWidth="2" />
          <circle cx={shape.pts[hoverIdx].x} cy={shape.pts[hoverIdx].y} r="5" fill={stroke} />
          <circle cx={shape.pts[hoverIdx].x} cy={shape.pts[hoverIdx].y} r="9" fill={stroke} opacity={0.18} />
        </g>
      ) : null}
    </svg>
  );
}

function DualLineChart(props: {
  a: number[];
  b: number[];
  aStroke?: string;
  bStroke?: string;
  height?: number;
}) {
  const height = props.height ?? 96;
  const width = 320;
  const aStroke = props.aStroke ?? "var(--color-brand-blue)";
  const bStroke = props.bStroke ?? "var(--color-brand-pink)";

  const paths = useMemo(() => {
    const a = props.a.length ? props.a : [0];
    const b = props.b.length ? props.b : [0];
    const n = Math.max(a.length, b.length);

    const aa = Array.from({ length: n }, (_, i) => a[Math.min(i, a.length - 1)] ?? 0);
    const bb = Array.from({ length: n }, (_, i) => b[Math.min(i, b.length - 1)] ?? 0);

    const vals = [...aa, ...bb];
    const max = Math.max(1, ...vals);
    const min = Math.min(0, ...vals);
    const span = Math.max(1, max - min);

    const stepX = n <= 1 ? 0 : width / (n - 1);

    function toPoints(series: number[]) {
      return series
        .map((v, i) => {
          const x = i * stepX;
          const y = height - ((v - min) / span) * height;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
    }

    return { aPts: toPoints(aa), bPts: toPoints(bb) };
  }, [props.a, props.b, height]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-hidden>
      <polyline points={paths.aPts} fill="none" stroke={aStroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={paths.bPts} fill="none" stroke={bStroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
    </svg>
  );
}

function MiniBars(props: { values: number[]; color?: string }) {
  const width = 320;
  const height = 72;
  const color = props.color ?? "var(--color-brand-ink)";

  const bars = useMemo(() => {
    const vals = props.values.length ? props.values : [0];
    const max = Math.max(1, ...vals);
    const gap = 6;
    const barW = (width - gap * (vals.length - 1)) / vals.length;

    return vals.map((v, i) => {
      const h = (Math.max(0, v) / max) * height;
      const x = i * (barW + gap);
      const y = height - h;
      return { x, y, w: barW, h };
    });
  }, [props.values]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-hidden>
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="8"
          fill={color}
          opacity={0.85}
        />
      ))}
    </svg>
  );
}

function DonutMix(props: { aPct: number; aLabel: string; bLabel: string }) {
  const size = 84;
  const r = 34;
  const c = 2 * Math.PI * r;
  const a = clampNum(props.aPct, 0, 100) / 100;
  const dashA = c * a;
  const dashB = c - dashA;
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(15,23,42,0.10)" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-brand-blue)"
          strokeWidth="10"
          strokeDasharray={`${dashA} ${dashB}`}
          strokeDashoffset={c * 0.25}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-brand-pink)"
          strokeWidth="10"
          strokeDasharray={`${dashB} ${dashA}`}
          strokeDashoffset={-(dashA - c * 0.25)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={0.9}
        />
      </svg>
      <div className="text-sm">
        <div className="font-semibold text-zinc-900">Revenue mix</div>
        <div className="mt-1 text-xs text-zinc-600">
          <span className="font-semibold text-[color:var(--color-brand-blue)]">{props.aLabel}</span> {Math.round(a * 100)}%
          <span className="mx-2 text-zinc-300">•</span>
          <span className="font-semibold text-[color:var(--color-brand-pink)]">{props.bLabel}</span> {Math.round((1 - a) * 100)}%
        </div>
      </div>
    </div>
  );
}

export default function ProfitVisualizationDashboardPage() {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [hoverMonthIndex, setHoverMonthIndex] = useState<number | null>(null);

  const [roiPlan, setRoiPlan] = useState<"membership" | "credits">("membership");
  const [roiUseEstimates, setRoiUseEstimates] = useState(true);
  const [roiEnabledModules, setRoiEnabledModules] = useState<Partial<Record<PortalModuleKey, boolean>>>({});
  const [roiCreditsPerMonth, setRoiCreditsPerMonth] = useState<number>(120);
  const [roiExtraRevenueUsdPerMonth, setRoiExtraRevenueUsdPerMonth] = useState<number>(600);
  const [roiHoursSavedPerMonth, setRoiHoursSavedPerMonth] = useState<number>(6);
  const [roiHourlyRateUsd, setRoiHourlyRateUsd] = useState<number>(75);

  const [mode, setMode] = useState<Mode>("combined");
  const [selectedMrr, setSelectedMrr] = useState<number>(100_000);
  const [customMrr, setCustomMrr] = useState<string>("");

  const [months, setMonths] = useState<number>(3);
  const [keep, setKeep] = useState<number>(KEEP_DEFAULT);

  const [growthPct, setGrowthPct] = useState<number>(0);

  const [monthlyArpu, setMonthlyArpu] = useState<number>(ARPU_DEFAULT_MONTHLY);
  const [creditArpu, setCreditArpu] = useState<number>(ARPU_DEFAULT_CREDIT);
  const [whale, setWhale] = useState(false);

  const [aovSource, setAovSource] = useState<AovSource>("modules");
  const [serviceMixPreset, setServiceMixPreset] = useState<ServiceMixPresetKey>("Standard");

  const [usdPerCreditSubscription, setUsdPerCreditSubscription] = useState<number>(DEFAULT_USD_PER_CREDIT_SUBSCRIPTION);
  const [usdPerCreditCreditsOnly, setUsdPerCreditCreditsOnly] = useState<number>(DEFAULT_USD_PER_CREDIT_CREDITS_ONLY);
  const [creditsPerMonthlyCustomer, setCreditsPerMonthlyCustomer] = useState<number>(SERVICE_MIX_PRESETS.Standard.creditsPerMonthlyCustomer);
  const [creditsPerCreditCustomer, setCreditsPerCreditCustomer] = useState<number>(SERVICE_MIX_PRESETS.Standard.creditsPerCreditCustomer);

  const [moduleAdoptionPct, setModuleAdoptionPct] = useState<ModulePctMap>(SERVICE_MIX_PRESETS.Standard.adoptionPct);
  const [valueUsdPerEnabledCustomer, setValueUsdPerEnabledCustomer] = useState<ModuleUsdMap>(DEFAULT_VALUE_USD_PER_ENABLED_CUSTOMER);

  const [monthlySharePct, setMonthlySharePct] = useState<number>(60);

  const [userSimCount, setUserSimCount] = useState<number>(25);
  const [userSimMix, setUserSimMix] = useState<UserSimMix>("credits-heavy");
  const [userSimSeed, setUserSimSeed] = useState<number>(() => Math.floor(Date.now() / 1000));
  const [userSimGoalUsd, setUserSimGoalUsd] = useState<number>(25_000);
  const [userSimSelectedIdx, setUserSimSelectedIdx] = useState<number>(1);

  const appliedMrr = useMemo(() => {
    const c = customMrr.trim();
    if (!c) return selectedMrr;
    const n = Number(c.replaceAll(",", ""));
    if (!Number.isFinite(n)) return selectedMrr;
    return Math.max(0, Math.floor(n));
  }, [customMrr, selectedMrr]);

  const computedMembershipArpu = useMemo(() => {
    const base = sum(
      (Object.keys(PORTAL_MODULE_CATALOG) as PortalModuleKey[]).map((k) => {
        const pct = clampNum((moduleAdoptionPct[k] ?? 0) / 100, 0, 1);
        const price = PORTAL_MODULE_CATALOG[k]?.monthlyUsd ?? 0;
        return price * pct;
      }),
    );
    const credits = Math.max(0, creditsPerMonthlyCustomer || 0) * Math.max(0, usdPerCreditSubscription || 0);
    return base + credits;
  }, [moduleAdoptionPct, creditsPerMonthlyCustomer, usdPerCreditSubscription]);

  const computedCreditsOnlyArpu = useMemo(() => {
    return Math.max(0, creditsPerCreditCustomer || 0) * Math.max(0, usdPerCreditCreditsOnly || 0);
  }, [creditsPerCreditCustomer, usdPerCreditCreditsOnly]);

  const userSimUsers = useMemo(() => {
    return simulateUsers({
      count: userSimCount,
      seed: userSimSeed,
      mix: userSimMix,
      moduleAdoptionPct,
      usdPerCreditSubscription,
      usdPerCreditCreditsOnly,
    });
  }, [moduleAdoptionPct, usdPerCreditCreditsOnly, usdPerCreditSubscription, userSimCount, userSimMix, userSimSeed]);

  useEffect(() => {
    setUserSimSelectedIdx((cur) => clampInt(cur, 1, userSimUsers.length || 1));
  }, [userSimUsers.length]);

  const userSimSummary = useMemo(() => {
    const users = userSimUsers;
    const total = sum(users.map((u) => u.totalUsd));
    const subs = sum(users.map((u) => u.subscriptionUsd));
    const credits = sum(users.map((u) => u.creditsUsd));
    const avg = users.length ? total / users.length : 0;

    const goal = Math.max(0, Number(userSimGoalUsd) || 0);
    const needed = avg > 0 ? Math.max(1, Math.ceil(goal / avg)) : 0;

    const perModule = (Object.keys(PORTAL_MODULE_CATALOG) as PortalModuleKey[])
      .filter((k) => k !== "crm")
      .map((k) => {
        const using = users.filter((u) => u.modules.includes(k));
        const usersUsing = using.length;
        const subsUsd = sum(using.map((u) => (u.plan === "membership" ? (PORTAL_MODULE_CATALOG[k]?.monthlyUsd ?? 0) : 0)));
        const creditsPerMonth = sum(using.map((u) => u.creditsByModule[k] ?? 0));
        const creditsUsd = sum(
          using.map((u) => {
            const c = u.creditsByModule[k] ?? 0;
            const rate = u.plan === "membership" ? usdPerCreditSubscription : usdPerCreditCreditsOnly;
            return Math.max(0, c) * Math.max(0, rate);
          }),
        );
        return {
          key: k,
          title: PORTAL_MODULE_CATALOG[k].title,
          usersUsing,
          subsUsd,
          creditsPerMonth,
          creditsUsd,
          totalUsd: subsUsd + creditsUsd,
        };
      })
      .sort((a, b) => b.totalUsd - a.totalUsd);

    const planCounts = {
      membership: users.filter((u) => u.plan === "membership").length,
      credits: users.filter((u) => u.plan === "credits").length,
    };

    return { total, subs, credits, avg, goal, needed, perModule, planCounts };
  }, [usdPerCreditCreditsOnly, usdPerCreditSubscription, userSimGoalUsd, userSimUsers]);

  const selectedUserSim = useMemo(() => {
    const idx = clampInt(userSimSelectedIdx, 1, userSimUsers.length || 1);
    return userSimUsers[idx - 1] ?? null;
  }, [userSimSelectedIdx, userSimUsers]);

  const effectiveMonthlyArpu = whale
    ? ARPU_WHALE
    : Math.max(1, Math.floor((aovSource === "modules" ? computedMembershipArpu : monthlyArpu) || 0));
  const effectiveCreditArpu = whale
    ? ARPU_WHALE
    : Math.max(1, Math.floor((aovSource === "modules" ? computedCreditsOnlyArpu : creditArpu) || 0));

  const monthlyShare = clampNum(monthlySharePct / 100, 0, 1);
  const creditShare = 1 - monthlyShare;

  const appliedMonths = clampNum(Math.floor(months || 0), 1, MAX_MONTHS);
  const appliedGrowthRate = clampNum((growthPct || 0) / 100, GROWTH_MIN_PCT / 100, GROWTH_MAX_PCT / 100);

  const revenueSeries = useMemo(() => {
    return Array.from({ length: appliedMonths }, (_, i) => appliedMrr * Math.pow(1 + appliedGrowthRate, i));
  }, [appliedMonths, appliedMrr, appliedGrowthRate]);

  const profitSeries = useMemo(() => revenueSeries.map((r) => r * keep), [revenueSeries, keep]);
  const cumulativeProfitSeries = useMemo(() => cumulative(profitSeries), [profitSeries]);

  const month1Revenue = revenueSeries[0] ?? 0;
  const endRevenue = revenueSeries[revenueSeries.length - 1] ?? 0;

  const profitMo = profitSeries[0] ?? calcProfitPerMonth(appliedMrr, keep);
  const profitTime = sum(profitSeries);

  const cust = customersNeeded({
    mrr: appliedMrr,
    mode,
    monthlyArpu: effectiveMonthlyArpu,
    creditArpu: effectiveCreditArpu,
    monthlyShare,
  });

  const moduleKeys = useMemo(() => Object.keys(PORTAL_MODULE_CATALOG) as PortalModuleKey[], []);

  useEffect(() => {
    setRoiEnabledModules((cur) => {
      if (cur && Object.keys(cur).length) return cur;
      const defaults: Partial<Record<PortalModuleKey, boolean>> = {};
      for (const k of moduleKeys) {
        if (k === "crm") continue;
        defaults[k] = k === "booking" || k === "reviews" || k === "blog";
      }
      return defaults;
    });
  }, [moduleKeys]);

  const profitSensitivity = useMemo(() => {
    const scenariosPct = [-10, -5, 0, 5, 10, 20] as const;
    const totals = scenariosPct.map((pct) => {
      const g = clampNum(pct / 100, GROWTH_MIN_PCT / 100, GROWTH_MAX_PCT / 100);
      let total = 0;
      for (let i = 0; i < appliedMonths; i++) {
        const rev = appliedMrr * Math.pow(1 + g, i);
        total += rev * keep;
      }
      return total;
    });

    return { scenariosPct, totals };
  }, [appliedMonths, appliedMrr, keep]);

  const roiEstimates = useMemo(() => {
    const enabledKeys = moduleKeys.filter((k) => k !== "crm" && roiEnabledModules?.[k]);

    let creditsPerMonth = 0;
    let extraRevenueUsdPerMonth = 0;
    let hoursSavedPerMonth = 0;

    const breakdown = enabledKeys
      .map((k) => {
        const d = ROI_DEFAULTS_BY_SERVICE[k];
        if (!d) return null;
        creditsPerMonth += Math.max(0, d.creditsPerMonth);
        extraRevenueUsdPerMonth += Math.max(0, d.extraRevenueUsdPerMonth);
        hoursSavedPerMonth += Math.max(0, d.hoursSavedPerMonth);
        return {
          key: k,
          title: PORTAL_MODULE_CATALOG[k]?.title ?? k,
          ...d,
        };
      })
      .filter(Boolean) as Array<{ key: PortalModuleKey; title: string } & RoiServiceDefaults>;

    return {
      enabledKeys,
      creditsPerMonth: Math.round(creditsPerMonth),
      extraRevenueUsdPerMonth: Math.round(extraRevenueUsdPerMonth),
      hoursSavedPerMonth: Math.round(hoursSavedPerMonth * 10) / 10,
      breakdown,
    };
  }, [moduleKeys, roiEnabledModules]);

  const singleCustomerRoi = useMemo(() => {
    const enabledKeys = roiEstimates.enabledKeys;

    const moduleCostUsd =
      roiPlan === "membership"
        ? sum(
            enabledKeys.map((k) => {
              const price = PORTAL_MODULE_CATALOG[k]?.monthlyUsd ?? 0;
              return Math.max(0, price);
            }),
          )
        : 0;

    const usdPerCredit = roiPlan === "membership" ? usdPerCreditSubscription : usdPerCreditCreditsOnly;

    const creditsUsed = roiUseEstimates ? roiEstimates.creditsPerMonth : Math.max(0, roiCreditsPerMonth || 0);
    const revenueLift = roiUseEstimates ? roiEstimates.extraRevenueUsdPerMonth : Math.max(0, roiExtraRevenueUsdPerMonth || 0);
    const hoursSaved = roiUseEstimates ? roiEstimates.hoursSavedPerMonth : Math.max(0, roiHoursSavedPerMonth || 0);

    const creditsCostUsd = creditsUsed * Math.max(0, usdPerCredit || 0);
    const costUsd = moduleCostUsd + creditsCostUsd;

    const timeValue = hoursSaved * Math.max(0, roiHourlyRateUsd || 0);

    const valueUsd = revenueLift + timeValue;
    const netUsd = valueUsd - costUsd;

    const roiMultiple = costUsd > 0 ? valueUsd / costUsd : 0;
    const roiPct = costUsd > 0 ? ((valueUsd - costUsd) / costUsd) * 100 : 0;
    const paybackMonths = netUsd > 0 ? costUsd / netUsd : null;

    return {
      enabledKeys,
      moduleCostUsd,
      creditsCostUsd,
      creditsUsed,
      costUsd,
      revenueLift,
      hoursSaved,
      timeValueUsd: timeValue,
      valueUsd,
      netUsd,
      roiMultiple,
      roiPct,
      paybackMonths,
    };
  }, [
    roiPlan,
    roiUseEstimates,
    roiEstimates,
    roiCreditsPerMonth,
    roiExtraRevenueUsdPerMonth,
    roiHoursSavedPerMonth,
    roiHourlyRateUsd,
    usdPerCreditSubscription,
    usdPerCreditCreditsOnly,
  ]);

  const serviceModel = useMemo(() => {
    const monthlyCustomers = cust.monthlyCustomers;
    const creditCustomers = cust.creditCustomers;

    const moduleRows = moduleKeys
      .filter((k) => k !== "crm")
      .map((k) => {
        const pct = clampNum(moduleAdoptionPct[k] ?? 0, 0, 100);
        const enabled = Math.max(0, monthlyCustomers) * (pct / 100);
        const enabledDisplay = Math.round(enabled);
        const mod = PORTAL_MODULE_CATALOG[k];
        const priceUsd = mod?.monthlyUsd ?? 0;
        const title = mod?.title ?? k;
        const purelyRevenueUsd = enabled * priceUsd;
        const valuePerEnabled = Math.max(0, valueUsdPerEnabledCustomer[k] ?? 0);
        const customerValueUsd = enabled * valuePerEnabled;

        return {
          key: k,
          title,
          pct,
          enabled,
          enabledDisplay,
          priceUsd,
          purelyRevenueUsd,
          valuePerEnabled,
          customerValueUsd,
          netValueUsd: customerValueUsd - purelyRevenueUsd,
        };
      });

    const creditsUsd =
      Math.max(0, monthlyCustomers) * Math.max(0, creditsPerMonthlyCustomer || 0) * Math.max(0, usdPerCreditSubscription || 0) +
      Math.max(0, creditCustomers) * Math.max(0, creditsPerCreditCustomer || 0) * Math.max(0, usdPerCreditCreditsOnly || 0);

    const purelyModuleRevenueUsd = sum(moduleRows.map((r) => r.purelyRevenueUsd));
    const customerValueUsd = sum(moduleRows.map((r) => r.customerValueUsd));
    const customerCostUsd = purelyModuleRevenueUsd + creditsUsd;
    const netCustomerValueUsd = customerValueUsd - customerCostUsd;
    const roiMultiple = customerCostUsd > 0 ? customerValueUsd / customerCostUsd : 0;

    const topByRevenue = [...moduleRows].sort((a, b) => b.purelyRevenueUsd - a.purelyRevenueUsd).slice(0, 3);
    const topByValue = [...moduleRows].sort((a, b) => b.netValueUsd - a.netValueUsd).slice(0, 3);

    const opportunities = [...moduleRows]
      .map((r) => {
        const price = Math.max(1, r.priceUsd);
        const score = (r.valuePerEnabled / price) * (1 - r.pct / 100);
        return { ...r, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    return {
      moduleRows,
      creditsUsd,
      purelyModuleRevenueUsd,
      customerValueUsd,
      customerCostUsd,
      netCustomerValueUsd,
      roiMultiple,
      topByRevenue,
      topByValue,
      opportunities,
    };
  }, [
    cust.monthlyCustomers,
    cust.creditCustomers,
    moduleKeys,
    moduleAdoptionPct,
    valueUsdPerEnabledCustomer,
    creditsPerMonthlyCustomer,
    creditsPerCreditCustomer,
    usdPerCreditSubscription,
    usdPerCreditCreditsOnly,
  ]);

  const serviceValueSeries = useMemo(() => {
    const cost: number[] = [];
    const value: number[] = [];
    const net: number[] = [];

    for (const mrr of revenueSeries) {
      const c = customersNeeded({
        mrr,
        mode,
        monthlyArpu: effectiveMonthlyArpu,
        creditArpu: effectiveCreditArpu,
        monthlyShare,
      });

      const monthlyCustomers = c.monthlyCustomers;
      const creditCustomers = c.creditCustomers;

      const moduleRevenueUsd = sum(
        moduleKeys
          .filter((k) => k !== "crm")
          .map((k) => {
            const pct = clampNum((moduleAdoptionPct[k] ?? 0) / 100, 0, 1);
            const price = PORTAL_MODULE_CATALOG[k]?.monthlyUsd ?? 0;
            return Math.max(0, monthlyCustomers) * pct * price;
          }),
      );

      const creditsUsd =
        Math.max(0, monthlyCustomers) * Math.max(0, creditsPerMonthlyCustomer || 0) * Math.max(0, usdPerCreditSubscription || 0) +
        Math.max(0, creditCustomers) * Math.max(0, creditsPerCreditCustomer || 0) * Math.max(0, usdPerCreditCreditsOnly || 0);

      const customerCostUsd = moduleRevenueUsd + creditsUsd;

      const customerValueUsd = sum(
        moduleKeys
          .filter((k) => k !== "crm")
          .map((k) => {
            const pct = clampNum((moduleAdoptionPct[k] ?? 0) / 100, 0, 1);
            const v = Math.max(0, valueUsdPerEnabledCustomer[k] ?? 0);
            return Math.max(0, monthlyCustomers) * pct * v;
          }),
      );

      cost.push(customerCostUsd);
      value.push(customerValueUsd);
      net.push(customerValueUsd - customerCostUsd);
    }

    return { cost, value, net };
  }, [
    revenueSeries,
    mode,
    effectiveMonthlyArpu,
    effectiveCreditArpu,
    monthlyShare,
    moduleKeys,
    moduleAdoptionPct,
    valueUsdPerEnabledCustomer,
    creditsPerMonthlyCustomer,
    creditsPerCreditCustomer,
    usdPerCreditSubscription,
    usdPerCreditCreditsOnly,
  ]);

  const weeklyBreakdown = useMemo(() => {
    const w = [0.24, 0.26, 0.25, 0.25];
    const profit = w.map((pct) => profitMo * pct);
    const revenue = w.map((pct) => month1Revenue * pct);
    return { profit, revenue };
  }, [profitMo, month1Revenue]);

  const comparisonRows = useMemo(() => {
    const modes: Mode[] = ["monthly", "credit", "combined"];
    return modes.map((m) => {
      const c = customersNeeded({
        mrr: appliedMrr,
        mode: m,
        monthlyArpu: effectiveMonthlyArpu,
        creditArpu: effectiveCreditArpu,
        monthlyShare,
      });
      return {
        mode: m,
        customers: c.customers,
        monthlyCustomers: c.monthlyCustomers,
        creditCustomers: c.creditCustomers,
        profitMo,
        profitTime,
      };
    });
  }, [appliedMrr, effectiveMonthlyArpu, effectiveCreditArpu, monthlyShare, profitMo, profitTime]);

  const summaryLine = useMemo(() => {
    const labelMrr = appliedMrr >= 1_000_000 ? `${appliedMrr / 1_000_000}M` : `${Math.round(appliedMrr / 1000)}k`;
    const profitMoK = Math.round(profitMo / 1000);
    const profitTimeK = Math.round(profitTime / 1000);
    const endK = Math.round(endRevenue / 1000);
    const growthLabel = (growthPct || 0) === 0 ? "flat" : `${growthPct > 0 ? "+" : ""}${growthPct}%/mo`;

    if (mode !== "combined") {
      const modeLabel = mode === "monthly" ? "Monthly-fee" : "Credit-only";
      const arpuLabel = mode === "monthly" ? effectiveMonthlyArpu : effectiveCreditArpu;
      return `Tier $${labelMrr}/mo (${growthLabel}; end ~$${endK}k/mo). Keep ${formatKeep(keep)} per $1 → month-1 profit ~$${profitMoK}k, total ${appliedMonths}mo ~$${profitTimeK}k. ${modeLabel} ARPU ${arpuLabel}: customers ${cust.customers}.`;
    }

    const customers = cust.customers;
    const monthlyCustomers = cust.monthlyCustomers;
    const creditCustomers = cust.creditCustomers;
    return `Tier $${labelMrr}/mo (${growthLabel}; end ~$${endK}k/mo). Keep ${formatKeep(keep)} per $1 → month-1 profit ~$${profitMoK}k, total ${appliedMonths}mo ~$${profitTimeK}k. Mixed ${Math.round(monthlyShare * 100)}/${Math.round(creditShare * 100)} with ARPU ${effectiveMonthlyArpu}/${effectiveCreditArpu}: customers ${customers} (${monthlyCustomers} membership, ${creditCustomers} credits).`;
  }, [appliedMrr, keep, profitMo, profitTime, mode, cust, effectiveMonthlyArpu, effectiveCreditArpu, monthlyShare, creditShare, endRevenue, growthPct, appliedMonths]);

  function reset() {
    setMode("combined");
    setSelectedMrr(100_000);
    setCustomMrr("");
    setMonths(3);
    setKeep(KEEP_DEFAULT);
    setGrowthPct(0);
    setMonthlyArpu(ARPU_DEFAULT_MONTHLY);
    setCreditArpu(ARPU_DEFAULT_CREDIT);
    setWhale(false);
    setMonthlySharePct(60);

    setAovSource("modules");
    setServiceMixPreset("Standard");
    setUsdPerCreditSubscription(DEFAULT_USD_PER_CREDIT_SUBSCRIPTION);
    setUsdPerCreditCreditsOnly(DEFAULT_USD_PER_CREDIT_CREDITS_ONLY);
    setCreditsPerMonthlyCustomer(SERVICE_MIX_PRESETS.Standard.creditsPerMonthlyCustomer);
    setCreditsPerCreditCustomer(SERVICE_MIX_PRESETS.Standard.creditsPerCreditCustomer);
    setModuleAdoptionPct(SERVICE_MIX_PRESETS.Standard.adoptionPct);
    setValueUsdPerEnabledCustomer(DEFAULT_VALUE_USD_PER_ENABLED_CUSTOMER);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryLine);
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative min-h-screen bg-brand-mist text-brand-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 -top-28 h-[420px] w-[420px] rounded-full bg-[color:var(--color-brand-blue)]/15 blur-3xl" />
        <div className="absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-[color:var(--color-brand-pink)]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[color:var(--color-brand-ink)]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-white shadow-sm">
              <Image src="/brand/1.png" alt="Purely" fill className="object-contain p-1.5" priority />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-zinc-900">Profit dashboard</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setAssumptionsOpen(true)}
              className="h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
              aria-haspopup="dialog"
              aria-expanded={assumptionsOpen}
            >
              Assumptions
            </button>
            <button
              type="button"
              onClick={() => void copySummary()}
              className="h-10 rounded-2xl bg-[color:var(--color-brand-blue)] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              Copy snapshot
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm">
            Start: {formatMoneyCompact(month1Revenue)} / mo
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm">
            End: {formatMoneyCompact(endRevenue)} / mo
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm">
            {appliedMonths} months
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm">
            Growth: {growthPct > 0 ? "+" : ""}{growthPct}% / mo
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm">
            Keep: {formatKeep(keep)}
          </div>
        </div>

        {/* Main */}
        <div className="mt-6 space-y-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Users → goal simulator</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Slide the user count to visualize hitting $25k / $30k months. Results are stable until you shuffle.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUserSimGoalUsd(25_000)}
                  className={
                    "h-10 rounded-2xl border px-4 text-sm font-semibold shadow-sm " +
                    (userSimGoalUsd === 25_000 ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
                  }
                >
                  $25k goal
                </button>
                <button
                  type="button"
                  onClick={() => setUserSimGoalUsd(30_000)}
                  className={
                    "h-10 rounded-2xl border px-4 text-sm font-semibold shadow-sm " +
                    (userSimGoalUsd === 30_000 ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
                  }
                >
                  $30k goal
                </button>
                <button
                  type="button"
                  onClick={() => setUserSimSeed(Math.floor(Date.now() / 1000))}
                  className="h-10 rounded-2xl bg-[color:var(--color-brand-blue)] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                >
                  Shuffle users
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Users</div>
                    <div className="mt-1 text-2xl font-bold text-zinc-900">{userSimCount.toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={userSimCount}
                      min={1}
                      max={500}
                      onChange={(e) => setUserSimCount(clampInt(Number(e.target.value), 1, 500))}
                      className="h-10 w-28 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    type="range"
                    min={1}
                    max={500}
                    step={1}
                    value={userSimCount}
                    onChange={(e) => setUserSimCount(clampInt(Number(e.target.value), 1, 500))}
                    className="w-full"
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-zinc-500">
                    <div>1</div>
                    <div>500</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Mix preset</div>
                    <div className="mt-1">
                      <PortalListboxDropdown<UserSimMix>
                        value={userSimMix}
                        onChange={setUserSimMix}
                        options={[
                          { value: "credits-heavy", label: "Credits-heavy (default)" },
                          { value: "balanced", label: "Balanced" },
                          { value: "membership-heavy", label: "Membership-heavy" },
                        ]}
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Credit price</div>
                      <div className="mt-0.5 text-sm font-semibold text-zinc-900">
                        ${usdPerCreditCreditsOnly.toFixed(2)} / credit
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-zinc-500">Credits-only</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Credit price</div>
                      <div className="mt-0.5 text-sm font-semibold text-zinc-900">
                        ${usdPerCreditSubscription.toFixed(2)} / credit
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-zinc-500">Membership</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Simulated month (this many users)</div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Total</div>
                    <div className="mt-0.5 text-lg font-bold text-zinc-900">{formatMoneyCompact(userSimSummary.total)}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-zinc-500">avg {formatMoneyCompact(userSimSummary.avg)} / user</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Goal</div>
                    <div className="mt-0.5 text-lg font-bold text-zinc-900">{formatMoneyCompact(userSimSummary.goal)}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-zinc-500">needs ~{userSimSummary.needed ? userSimSummary.needed.toLocaleString() : "-"} users</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Revenue mix</div>
                    <div className="mt-0.5 text-sm font-semibold text-zinc-900">
                      {formatMoneyCompact(userSimSummary.subs)} subs
                      <span className="mx-2 text-zinc-300">•</span>
                      {formatMoneyCompact(userSimSummary.credits)} credits
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                      {userSimSummary.planCounts.membership.toLocaleString()} membership
                      <span className="mx-2 text-zinc-300">•</span>
                      {userSimSummary.planCounts.credits.toLocaleString()} credits-only
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Goal input</div>
                    <input
                      type="number"
                      value={userSimGoalUsd}
                      min={0}
                      step={100}
                      onChange={(e) => setUserSimGoalUsd(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Selected user</div>
                    <div className="mt-1 text-2xl font-bold text-zinc-900">#{userSimSelectedIdx}</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, userSimUsers.length)}
                    value={userSimSelectedIdx}
                    onChange={(e) => setUserSimSelectedIdx(clampInt(Number(e.target.value), 1, userSimUsers.length || 1))}
                    className="h-10 w-28 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm"
                  />
                </div>

                <div className="mt-3">
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, userSimUsers.length)}
                    step={1}
                    value={userSimSelectedIdx}
                    onChange={(e) => setUserSimSelectedIdx(clampInt(Number(e.target.value), 1, userSimUsers.length || 1))}
                    className="w-full"
                  />
                </div>

                <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Plan</div>
                    <div className="text-xs font-semibold text-zinc-800">{selectedUserSim?.plan === "membership" ? "Membership" : "Credits-only"}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-zinc-50 px-2 py-1.5">
                      <div className="font-semibold text-zinc-900">Subs</div>
                      <div className="text-zinc-600">{formatMoneyCompact(selectedUserSim?.subscriptionUsd ?? 0)}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-2 py-1.5">
                      <div className="font-semibold text-zinc-900">Credits</div>
                      <div className="text-zinc-600">{formatMoneyCompact(selectedUserSim?.creditsUsd ?? 0)}</div>
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-2 py-1.5">
                      <div className="font-semibold text-zinc-900">Total</div>
                      <div className="text-zinc-600">{formatMoneyCompact(selectedUserSim?.totalUsd ?? 0)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Revenue by module</div>
                    <div className="mt-1 text-xs text-zinc-600">Subscription + credits usage (simulated).</div>
                  </div>
                </div>

                <div className="mt-3 overflow-auto">
                  <table className="min-w-[560px] w-full text-left text-xs">
                    <thead className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2">Module</th>
                        <th className="py-2">Users</th>
                        <th className="py-2">Subs</th>
                        <th className="py-2">Credits</th>
                        <th className="py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSimSummary.perModule.slice(0, 10).map((r) => (
                        <tr key={r.key} className="border-t border-zinc-100">
                          <td className="py-2 font-semibold text-zinc-900">{r.title}</td>
                          <td className="py-2 text-zinc-700">{r.usersUsing.toLocaleString()}</td>
                          <td className="py-2 text-zinc-700">{formatMoneyCompact(r.subsUsd)}</td>
                          <td className="py-2 text-zinc-700">{formatMoneyCompact(r.creditsUsd)}</td>
                          <td className="py-2 font-semibold text-zinc-900">{formatMoneyCompact(r.totalUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Selected user breakdown</div>
                  <div className="mt-1 text-xs text-zinc-600">Enabled modules + estimated monthly credits by service.</div>
                </div>

                <div className="mt-3 rounded-2xl bg-zinc-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Modules</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {selectedUserSim?.modules?.length ? selectedUserSim.modules.map((k) => PORTAL_MODULE_CATALOG[k]?.title ?? k).join(", ") : "(none)"}
                  </div>
                </div>

                <div className="mt-3 overflow-auto">
                  <table className="min-w-[420px] w-full text-left text-xs">
                    <thead className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2">Service</th>
                        <th className="py-2">Credits/mo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(PORTAL_MODULE_CATALOG) as PortalModuleKey[])
                        .filter((k) => k !== "crm")
                        .filter((k) => (selectedUserSim?.creditsByModule?.[k] ?? 0) > 0)
                        .sort((a, b) => (selectedUserSim?.creditsByModule?.[b] ?? 0) - (selectedUserSim?.creditsByModule?.[a] ?? 0))
                        .slice(0, 10)
                        .map((k) => (
                          <tr key={k} className="border-t border-zinc-100">
                            <td className="py-2 font-semibold text-zinc-900">{PORTAL_MODULE_CATALOG[k]?.title ?? k}</td>
                            <td className="py-2 text-zinc-700">{Math.round(selectedUserSim?.creditsByModule?.[k] ?? 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      {!selectedUserSim || (selectedUserSim.creditsPerMonth ?? 0) <= 0 ? (
                        <tr className="border-t border-zinc-100">
                          <td className="py-2 text-zinc-600" colSpan={2}>
                            No credits usage estimated for this user.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SurfaceCard title="Start monthly revenue" value={formatMoneyCompact(month1Revenue)} sub="Tier" accent="ink" />
            <SurfaceCard title={`End monthly revenue`} value={formatMoneyCompact(endRevenue)} sub={`${growthPct > 0 ? "+" : ""}${growthPct}% per month`} accent="blue" />
            <SurfaceCard title="Net retained" value={formatPct1(keep)} sub={`${formatKeep(keep)} per $1 collected`} accent="ink" />
            <SurfaceCard title="Month 1 profit" value={formatMoneyCompact(profitMo)} sub="Starts here" accent="pink" />
            <SurfaceCard title={`Total profit (${appliedMonths} months)`} value={formatMoneyCompact(profitTime)} sub="Sum of all months" accent="blue" />
          </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Profit curve</div>
                    <div className="mt-1 text-xs text-zinc-600">Cumulative profit across the timeframe.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total</div>
                    <div className="text-lg font-bold text-zinc-900">{formatMoneyCompact(profitTime)}</div>
                    {typeof hoverMonthIndex === "number" ? (
                      <div className="mt-1 text-[11px] font-semibold text-zinc-600">
                        Month {hoverMonthIndex + 1}: {formatMoneyCompact(cumulativeProfitSeries[hoverMonthIndex] ?? 0)}
                        <span className="mx-1 text-zinc-300">•</span>
                        {formatMoneyCompact(profitSeries[hoverMonthIndex] ?? 0)} / mo
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 h-28">
                  <HoverSparkArea values={cumulativeProfitSeries} stroke="var(--color-brand-blue)" onHoverIndex={setHoverMonthIndex} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <div className="font-semibold text-zinc-900">Month 1</div>
                    <div className="text-zinc-600">{formatMoneyCompact(profitSeries[0] ?? profitMo)}</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <div className="font-semibold text-zinc-900">Month {Math.min(3, appliedMonths)}</div>
                    <div className="text-zinc-600">{formatMoneyCompact(cumulativeProfitSeries[Math.min(3, appliedMonths) - 1] ?? profitTime)}</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <div className="font-semibold text-zinc-900">Month {appliedMonths}</div>
                    <div className="text-zinc-600">{formatMoneyCompact(cumulativeProfitSeries[appliedMonths - 1] ?? profitTime)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Monthly profit</div>
                    <div className="mt-1 text-xs text-zinc-600">Month-by-month (growth applied).</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Per month</div>
                    <div className="text-lg font-bold text-zinc-900">{formatMoneyCompact(profitMo)}</div>
                  </div>
                </div>
                <div className="mt-4 h-20">
                  <MiniBars
                    values={profitSeries}
                    color="var(--color-brand-ink)"
                  />
                </div>
                <div className="mt-4 rounded-2xl bg-gradient-to-br from-[color:var(--color-brand-blue)]/10 to-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Quick read</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {formatMoneyCompact(profitSeries[0] ?? profitMo)} (month 1) → {formatMoneyCompact(profitSeries[profitSeries.length - 1] ?? profitMo)} (month {appliedMonths})
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Profit sensitivity</div>
                    <div className="mt-1 text-xs text-zinc-600">Total profit across growth scenarios (same timeframe).</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">End</div>
                    <div className="text-lg font-bold text-zinc-900">{formatMoneyCompact(endRevenue)}</div>
                  </div>
                </div>
                <div className="mt-4 h-20">
                  <MiniBars values={profitSensitivity.totals} color="var(--color-brand-pink)" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  {profitSensitivity.scenariosPct.map((pct, i) => (
                    <div key={pct} className="rounded-2xl bg-zinc-50 px-3 py-2">
                      <div className="font-semibold text-zinc-900">{pct > 0 ? "+" : ""}{pct}% / mo</div>
                      <div className="text-zinc-600">{formatMoneyCompact(profitSensitivity.totals[i] ?? 0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Customer math</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total customers</div>
                  <div className="text-2xl font-bold tracking-tight text-zinc-900">{cust.customers.toLocaleString()}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Membership customers</div>
                  <div className="mt-2 text-2xl font-bold text-zinc-900">
                    {(mode === "credit" ? 0 : mode === "monthly" ? cust.customers : cust.monthlyCustomers).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">Avg {formatMoneyCompact(effectiveMonthlyArpu)} / month</div>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit customers</div>
                  <div className="mt-2 text-2xl font-bold text-zinc-900">
                    {(mode === "monthly" ? 0 : mode === "credit" ? cust.customers : cust.creditCustomers).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">Avg {formatMoneyCompact(effectiveCreditArpu)} / month</div>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Average profit per customer</div>
                  <div className="mt-2 text-2xl font-bold text-zinc-900">
                    {formatMoneyCompact(cust.customers ? profitMo / cust.customers : 0)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">(monthly profit / customers)</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Single customer ROI</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Model one customer: what they pay, the value created, and payback.
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">ROI</div>
                  <div className="text-2xl font-bold tracking-tight text-zinc-900">
                    {(Math.round(singleCustomerRoi.roiMultiple * 10) / 10).toFixed(1)}×
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {singleCustomerRoi.roiPct >= 0 ? "+" : ""}{Math.round(singleCustomerRoi.roiPct)}%
                    {singleCustomerRoi.paybackMonths ? (
                      <>
                        <span className="mx-2 text-zinc-300">•</span>
                        Payback ~{Math.max(0, Math.round(singleCustomerRoi.paybackMonths * 10) / 10)} mo
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Plan</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setRoiPlan("membership")}
                      className={classNames(
                        "rounded-2xl px-3 py-2 text-sm font-semibold transition",
                        roiPlan === "membership" ? "bg-[color:var(--color-brand-ink)] text-white" : "bg-white text-zinc-800 hover:bg-zinc-100",
                      )}
                    >
                      Membership
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoiPlan("credits")}
                      className={classNames(
                        "rounded-2xl px-3 py-2 text-sm font-semibold transition",
                        roiPlan === "credits" ? "bg-[color:var(--color-brand-ink)] text-white" : "bg-white text-zinc-800 hover:bg-zinc-100",
                      )}
                    >
                      Credits-only
                    </button>
                  </div>

                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-zinc-900">Estimates</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setRoiUseEstimates(true)}
                          className={classNames(
                            "rounded-xl px-2 py-1 text-xs font-semibold transition",
                            roiUseEstimates ? "bg-[color:var(--color-brand-ink)] text-white" : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
                          )}
                        >
                          Auto
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRoiUseEstimates(false);
                            setRoiCreditsPerMonth(roiEstimates.creditsPerMonth);
                            setRoiExtraRevenueUsdPerMonth(roiEstimates.extraRevenueUsdPerMonth);
                            setRoiHoursSavedPerMonth(Math.round(roiEstimates.hoursSavedPerMonth));
                          }}
                          className={classNames(
                            "rounded-xl px-2 py-1 text-xs font-semibold transition",
                            !roiUseEstimates ? "bg-[color:var(--color-brand-ink)] text-white" : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
                          )}
                        >
                          Custom
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-600">
                      {roiUseEstimates
                        ? "Auto uses rough averages per selected service."
                        : "Custom lets you override the averages."}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="block">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credits used / month</div>
                      <input
                        type="number"
                        value={roiUseEstimates ? roiEstimates.creditsPerMonth : roiCreditsPerMonth}
                        onChange={(e) => setRoiCreditsPerMonth(toInt(e.target.value, 0))}
                        disabled={roiUseEstimates}
                        className={classNames(
                          "mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm",
                          roiUseEstimates ? "opacity-70" : "",
                        )}
                        min={0}
                      />
                      <div className="mt-1 text-[11px] text-zinc-600">
                        Charged at {formatKeep(roiPlan === "membership" ? usdPerCreditSubscription : usdPerCreditCreditsOnly)} per credit.
                      </div>
                    </label>

                    {roiUseEstimates && roiEstimates.breakdown.length ? (
                      <div className="rounded-2xl bg-white px-3 py-2 text-[11px] text-zinc-700">
                        <div className="font-semibold text-zinc-900">What’s driving the estimate</div>
                        <div className="mt-1 text-zinc-600">
                          Auto totals are a simple funnel model: per-service defaults for credits used/mo, incremental revenue/mo, and hours saved/mo.
                        </div>
                        <div className="mt-2 space-y-1">
                          {roiEstimates.breakdown.slice(0, 6).map((b) => (
                            <div key={b.key} className="flex items-center justify-between gap-3">
                              <div className="truncate font-semibold text-zinc-900">{b.title}</div>
                              <div className="shrink-0 text-zinc-700">
                                {Math.round(b.creditsPerMonth)}c • {formatMoneyCompact(b.extraRevenueUsdPerMonth)} • {b.hoursSavedPerMonth}h
                              </div>
                            </div>
                          ))}
                          {roiEstimates.breakdown.length > 6 ? (
                            <div className="text-zinc-500">+ {roiEstimates.breakdown.length - 6} more</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-4 lg:col-span-2">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Enabled services</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">
                        {singleCustomerRoi.enabledKeys.length ? `${singleCustomerRoi.enabledKeys.length} selected` : "None selected"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRoiEnabledModules((cur) => {
                          const next: Partial<Record<PortalModuleKey, boolean>> = { ...(cur || {}) };
                          for (const k of moduleKeys) if (k !== "crm") next[k] = false;
                          return next;
                        });
                      }}
                      className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {moduleKeys
                      .filter((k) => k !== "crm")
                      .map((k) => {
                        const mod = PORTAL_MODULE_CATALOG[k];
                        const title = mod?.title ?? k;
                        const price = mod?.monthlyUsd ?? 0;
                        const enabled = Boolean(roiEnabledModules?.[k]);
                        return (
                          <label key={k} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white px-3 py-3">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() =>
                                setRoiEnabledModules((cur) => ({
                                  ...(cur || {}),
                                  [k]: !Boolean(cur?.[k]),
                                }))
                              }
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                              <div className="truncate text-xs text-zinc-600">
                                {roiPlan === "membership" ? `${formatMoneyCompact(price)} / mo` : "Included (credits-only)"}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Revenue lift / month</div>
                      <input
                        type="number"
                        value={roiUseEstimates ? roiEstimates.extraRevenueUsdPerMonth : roiExtraRevenueUsdPerMonth}
                        onChange={(e) => setRoiExtraRevenueUsdPerMonth(toInt(e.target.value, 0))}
                        disabled={roiUseEstimates}
                        className={classNames(
                          "mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm",
                          roiUseEstimates ? "opacity-70" : "",
                        )}
                        min={0}
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hours saved / month</div>
                      <input
                        type="number"
                        value={roiUseEstimates ? roiEstimates.hoursSavedPerMonth : roiHoursSavedPerMonth}
                        onChange={(e) => setRoiHoursSavedPerMonth(toInt(e.target.value, 0))}
                        disabled={roiUseEstimates}
                        className={classNames(
                          "mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm",
                          roiUseEstimates ? "opacity-70" : "",
                        )}
                        min={0}
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Time value ($/hour)</div>
                      <input
                        type="number"
                        value={roiHourlyRateUsd}
                        onChange={(e) => setRoiHourlyRateUsd(toInt(e.target.value, 0))}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        min={0}
                      />
                      <div className="mt-1 text-[11px] text-zinc-600">
                        What an hour of owner/staff time is worth (wage + overhead + opportunity cost).
                      </div>
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cost / mo</div>
                      <div className="mt-1 text-lg font-bold text-zinc-900">{formatMoneyCompact(singleCustomerRoi.costUsd)}</div>
                      <div className="mt-1 text-[11px] text-zinc-600">
                        {formatMoneyCompact(singleCustomerRoi.moduleCostUsd)} modules + {formatMoneyCompact(singleCustomerRoi.creditsCostUsd)} credits ({Math.round(singleCustomerRoi.creditsUsed)}c)
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Value / mo</div>
                      <div className="mt-1 text-lg font-bold text-zinc-900">{formatMoneyCompact(singleCustomerRoi.valueUsd)}</div>
                      <div className="mt-1 text-[11px] text-zinc-600">
                        {formatMoneyCompact(singleCustomerRoi.revenueLift)} revenue + {formatMoneyCompact(singleCustomerRoi.timeValueUsd)} time value
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Net / mo</div>
                      <div className="mt-1 text-lg font-bold text-zinc-900">{formatMoneyCompact(singleCustomerRoi.netUsd)}</div>
                      <div className="mt-1 text-[11px] text-zinc-600">Value minus cost</div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payback</div>
                      <div className="mt-1 text-lg font-bold text-zinc-900">
                        {singleCustomerRoi.paybackMonths ? `${Math.max(0, Math.round(singleCustomerRoi.paybackMonths * 10) / 10)} mo` : "-"}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-600">If net is positive</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div className="text-sm font-semibold text-zinc-900">How we calculated the ROI inputs</div>
                      <div className="text-[11px] text-zinc-600">
                        {roiUseEstimates
                          ? "Auto = sum of per-service heuristics (below)."
                          : "Custom = you override totals (heuristics shown for reference)."}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-zinc-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credits</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-900">
                          {Math.round(singleCustomerRoi.creditsUsed)} credits / month
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-600">
                          Credits cost {formatMoneyCompact(singleCustomerRoi.creditsCostUsd)} = {Math.round(singleCustomerRoi.creditsUsed)} × {formatKeep(roiPlan === "membership" ? usdPerCreditSubscription : usdPerCreditCreditsOnly)}.
                        </div>
                        {roiEstimates.breakdown.length ? (
                          <div className="mt-2 space-y-1 text-[11px] text-zinc-700">
                            {roiEstimates.breakdown.slice(0, 4).map((b) => (
                              <div key={b.key} className="flex items-center justify-between gap-3">
                                <div className="truncate font-semibold text-zinc-900">{b.title}</div>
                                <div className="shrink-0 text-zinc-700">{Math.round(b.creditsPerMonth)}c</div>
                              </div>
                            ))}
                            {roiEstimates.breakdown.length > 4 ? (
                              <div className="text-zinc-500">+ {roiEstimates.breakdown.length - 4} more</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] text-zinc-600">Select services to see the credit assumptions.</div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-zinc-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Revenue lift</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-900">
                          {formatMoneyCompact(singleCustomerRoi.revenueLift)} / month
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-600">
                          This is the estimated incremental revenue from using the selected services (e.g. more booked appointments, higher close rate).
                        </div>
                        {roiEstimates.breakdown.length ? (
                          <div className="mt-2 space-y-1 text-[11px] text-zinc-700">
                            {roiEstimates.breakdown.slice(0, 4).map((b) => (
                              <div key={b.key} className="flex items-center justify-between gap-3">
                                <div className="truncate font-semibold text-zinc-900">{b.title}</div>
                                <div className="shrink-0 text-zinc-700">{formatMoneyCompact(b.extraRevenueUsdPerMonth)}</div>
                              </div>
                            ))}
                            {roiEstimates.breakdown.length > 4 ? (
                              <div className="text-zinc-500">+ {roiEstimates.breakdown.length - 4} more</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] text-zinc-600">Select services to see the revenue assumptions.</div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-zinc-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hours saved</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-900">{singleCustomerRoi.hoursSaved} hours / month</div>
                        <div className="mt-1 text-[11px] text-zinc-600">
                          Time value {formatMoneyCompact(singleCustomerRoi.timeValueUsd)} = {singleCustomerRoi.hoursSaved} × {formatMoneyCompact(roiHourlyRateUsd)} / hour.
                        </div>
                        {roiEstimates.breakdown.length ? (
                          <div className="mt-2 space-y-1 text-[11px] text-zinc-700">
                            {roiEstimates.breakdown.slice(0, 4).map((b) => (
                              <div key={b.key} className="flex items-center justify-between gap-3">
                                <div className="truncate font-semibold text-zinc-900">{b.title}</div>
                                <div className="shrink-0 text-zinc-700">{b.hoursSavedPerMonth}h</div>
                              </div>
                            ))}
                            {roiEstimates.breakdown.length > 4 ? (
                              <div className="text-zinc-500">+ {roiEstimates.breakdown.length - 4} more</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] text-zinc-600">Select services to see the time-savings assumptions.</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-[11px] text-zinc-600">
                      Value/mo = revenue lift + time value. Cost/mo = modules (membership only) + credits used. Defaults come from rough heuristics per service (ROI_DEFAULTS_BY_SERVICE) and should be tuned per niche.
                    </div>

                    <details className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
                        Why these defaults? (the reasoning)
                      </summary>
                      <div className="mt-2 text-[11px] text-zinc-600">
                        These are not pulled from your live usage; they are intentionally conservative starter assumptions. The mental model is:
                        credits ≈ how often the service runs (messages, content, calls, enrichment), revenue lift ≈ small conversion/coverage gains,
                        and hours saved ≈ removing repetitive admin work. Tune them after you observe real call volume, lead volume, and AOV.
                      </div>

                      {roiEstimates.breakdown.length ? (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {roiEstimates.breakdown.map((b) => {
                            const r = ROI_RATIONALE_BY_SERVICE[b.key];
                            if (!r) return null;
                            return (
                              <div key={b.key} className="rounded-2xl bg-zinc-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{b.title}</div>
                                    <div className="mt-0.5 text-[11px] text-zinc-600">
                                      Defaults: {Math.round(b.creditsPerMonth)}c • {formatMoneyCompact(b.extraRevenueUsdPerMonth)} • {b.hoursSavedPerMonth}h
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-2 space-y-2 text-[11px]">
                                  <div>
                                    <div className="font-semibold text-zinc-900">Why credits</div>
                                    <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700">
                                      {r.credits.map((t, i) => (
                                        <li key={i}>{t}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-zinc-900">Why revenue lift</div>
                                    <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700">
                                      {r.revenue.map((t, i) => (
                                        <li key={i}>{t}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-zinc-900">Why hours saved</div>
                                    <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-700">
                                      {r.hours.map((t, i) => (
                                        <li key={i}>{t}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 text-[11px] text-zinc-600">Select services above to see the reasoning per service.</div>
                      )}
                    </details>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">AOV breakdown</div>
                    <div className="mt-1 text-xs text-zinc-600">Real module prices + credits assumptions.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credits spend</div>
                    <div className="text-lg font-bold text-zinc-900">{formatMoneyCompact(serviceModel.creditsUsd)}</div>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[680px]">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <th className="py-2">Service</th>
                        <th className="py-2">Adoption</th>
                        <th className="py-2">Customers</th>
                        <th className="py-2">Price</th>
                        <th className="py-2">Purely revenue</th>
                        <th className="py-2">Customer value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceModel.moduleRows.map((r) => (
                        <tr key={r.key} className="border-t border-zinc-200">
                          <td className="py-3 font-semibold text-zinc-900">{r.title}</td>
                          <td className="py-3 text-zinc-700">{Math.round(r.pct)}%</td>
                          <td className="py-3 text-zinc-700">{r.enabledDisplay.toLocaleString()}</td>
                          <td className="py-3 text-zinc-700">{formatMoneyCompact(r.priceUsd)} / mo</td>
                          <td className="py-3 text-zinc-700">{formatMoneyCompact(r.purelyRevenueUsd)}</td>
                          <td className="py-3 text-zinc-700">{formatMoneyCompact(r.customerValueUsd)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-zinc-200">
                        <td className="py-3 font-semibold text-zinc-900">Credits (usage)</td>
                        <td className="py-3 text-zinc-700">-</td>
                        <td className="py-3 text-zinc-700">-</td>
                        <td className="py-3 text-zinc-700">-</td>
                        <td className="py-3 text-zinc-700">{formatMoneyCompact(serviceModel.creditsUsd)}</td>
                        <td className="py-3 text-zinc-700">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Purely revenue</div>
                    <div className="mt-1 text-lg font-bold text-zinc-900">{formatMoneyCompact(serviceModel.customerCostUsd)}</div>
                    <div className="mt-1 text-xs text-zinc-600">Modules + credits</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer value</div>
                    <div className="mt-1 text-lg font-bold text-zinc-900">{formatMoneyCompact(serviceModel.customerValueUsd)}</div>
                    <div className="mt-1 text-xs text-zinc-600">Estimated value created</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Net value</div>
                    <div className="mt-1 text-lg font-bold text-zinc-900">{formatMoneyCompact(serviceModel.netCustomerValueUsd)}</div>
                    <div className="mt-1 text-xs text-zinc-600">Value minus cost</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Customer ROI</div>
                    <div className="mt-1 text-xs text-zinc-600">Which services drive the most value.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">ROI multiple</div>
                    <div className="text-lg font-bold text-zinc-900">{(Math.round(serviceModel.roiMultiple * 10) / 10).toFixed(1)}×</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top by Purely revenue</div>
                    <div className="mt-2 space-y-2 text-sm">
                      {serviceModel.topByRevenue.map((r) => (
                        <div key={r.key} className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-zinc-900">{r.title}</div>
                          <div className="text-zinc-700">{formatMoneyCompact(r.purelyRevenueUsd)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top by net customer value</div>
                    <div className="mt-2 space-y-2 text-sm">
                      {serviceModel.topByValue.map((r) => (
                        <div key={r.key} className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-zinc-900">{r.title}</div>
                          <div className="text-zinc-700">{formatMoneyCompact(r.netValueUsd)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Value vs cost (per month)</div>
                      <div className="mt-1 text-xs text-zinc-600">Estimated customer value created vs what they pay you.</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Net (month 1)</div>
                      <div className="text-base font-bold text-zinc-900">{formatMoneyCompact(serviceValueSeries.net[0] ?? 0)}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-24">
                    <DualLineChart
                      a={serviceValueSeries.value}
                      b={serviceValueSeries.cost}
                      aStroke="var(--color-brand-blue)"
                      bStroke="var(--color-brand-ink)"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                      <span className="font-semibold text-[color:var(--color-brand-blue)]">Value</span> {formatMoneyCompact(serviceValueSeries.value[0] ?? 0)} → {formatMoneyCompact(serviceValueSeries.value[serviceValueSeries.value.length - 1] ?? 0)}
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                      <span className="font-semibold text-[color:var(--color-brand-ink)]">Cost</span> {formatMoneyCompact(serviceValueSeries.cost[0] ?? 0)} → {formatMoneyCompact(serviceValueSeries.cost[serviceValueSeries.cost.length - 1] ?? 0)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Upsell opportunities</div>
                  <div className="mt-2 text-xs text-zinc-600">High value/price with low adoption (simple heuristic).</div>
                  <div className="mt-3 space-y-2 text-sm">
                    {serviceModel.opportunities.map((r) => (
                      <div key={r.key} className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-zinc-900">{r.title}</div>
                        <div className="text-zinc-700">{Math.round(r.pct)}% • {formatMoneyCompact(r.valuePerEnabled)} value</div>
                      </div>
                    ))}
                  </div>
                </div>

                {appliedMonths === 1 ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Weekly view (month 1)</div>
                        <div className="text-xs text-zinc-600">A simple 4-week split for readability.</div>
                      </div>
                      <div className="text-sm font-bold text-zinc-900">{formatMoneyCompact(profitMo)} / mo</div>
                    </div>
                    <div className="mt-3 h-20">
                      <MiniBars values={weeklyBreakdown.profit} color="var(--color-brand-pink)" />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      {weeklyBreakdown.profit.map((v, i) => (
                        <div key={i} className="rounded-2xl bg-zinc-50 px-3 py-2">
                          <div className="font-semibold text-zinc-900">Week {i + 1}</div>
                          <div className="text-zinc-600">{formatMoneyCompact(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
        </div>

        {/* Assumptions Drawer */}
        {assumptionsOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              aria-label="Close assumptions"
              onClick={() => setAssumptionsOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-zinc-900">Assumptions</div>
                    <div className="mt-0.5 text-xs text-zinc-600">Everything that drives the numbers.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAssumptionsOpen(false)}
                    className="h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="space-y-6 px-5 py-6">
                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-zinc-900">Monthly revenue</div>
                  <div className="mt-1 text-xs text-zinc-600">Pick one tier at a time.</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {MRR_PRESETS.map((mrr) => (
                      <SegButton
                        key={mrr}
                        active={!customMrr.trim() && selectedMrr === mrr}
                        onClick={() => {
                          setCustomMrr("");
                          setSelectedMrr(mrr);
                        }}
                      >
                        {formatMoneyCompact(mrr)}
                      </SegButton>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="text-xs font-semibold text-zinc-600">Custom</div>
                    <input
                      value={customMrr}
                      onChange={(e) => setCustomMrr(e.target.value)}
                      inputMode="numeric"
                      placeholder="100000"
                      className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-zinc-900">Timeframe</div>
                  <div className="mt-1 text-xs text-zinc-600">Set any month count (1-{MAX_MONTHS}).</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {MONTH_PRESETS.map((m) => (
                      <SegButton key={m} active={appliedMonths === m} onClick={() => setMonths(m)}>
                        {m} months
                      </SegButton>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3">
                    <input
                      type="range"
                      min={1}
                      max={MAX_MONTHS}
                      step={1}
                      value={appliedMonths}
                      onChange={(e) => setMonths(clampNum(Number(e.target.value), 1, MAX_MONTHS))}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-zinc-600">Months</div>
                      <input
                        value={appliedMonths}
                        onChange={(e) => setMonths(clampNum(toInt(e.target.value, appliedMonths), 1, MAX_MONTHS))}
                        inputMode="numeric"
                        className="h-10 w-28 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-zinc-900">Growth</div>
                  <div className="mt-1 text-xs text-zinc-600">Monthly compounding growth for the tier.</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {GROWTH_PRESETS_PCT.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setGrowthPct(p)}
                        className={classNames(
                          "h-9 rounded-2xl border px-3 text-sm font-semibold",
                          growthPct === p ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                        )}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3">
                    <input
                      type="range"
                      min={GROWTH_MIN_PCT}
                      max={GROWTH_MAX_PCT}
                      step={1}
                      value={growthPct}
                      onChange={(e) => setGrowthPct(clampNum(Number(e.target.value), GROWTH_MIN_PCT, GROWTH_MAX_PCT))}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-zinc-600">% per month</div>
                      <input
                        value={growthPct}
                        onChange={(e) => setGrowthPct(clampNum(toInt(e.target.value, growthPct), GROWTH_MIN_PCT, GROWTH_MAX_PCT))}
                        inputMode="numeric"
                        className="h-10 w-28 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-zinc-900">Revenue style</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SegButton active={mode === "monthly"} onClick={() => setMode("monthly")}>Membership</SegButton>
                    <SegButton active={mode === "credit"} onClick={() => setMode("credit")}>Credits</SegButton>
                    <SegButton active={mode === "combined"} onClick={() => setMode("combined")}>Mixed</SegButton>
                  </div>
                  <div className="mt-3">
                    <DonutMix aPct={mode === "credit" ? 0 : mode === "monthly" ? 100 : Math.round(monthlyShare * 100)} aLabel="Membership" bLabel="Credits" />
                  </div>
                  {mode === "combined" ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Mix</div>
                          <div className="text-xs text-zinc-600">Split of membership vs credits.</div>
                        </div>
                        <div className="text-sm font-bold text-zinc-900">{Math.round(monthlyShare * 100)}% / {Math.round(creditShare * 100)}%</div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={monthlySharePct}
                        onChange={(e) => setMonthlySharePct(clampNum(Number(e.target.value), 0, 100))}
                        className="mt-3 w-full"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-zinc-900">Net retained</div>
                  <div className="mt-1 text-xs text-zinc-600">How much you keep from each $1.</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-zinc-900">{formatKeep(keep)} ({formatPct1(keep)})</div>
                    <div className="text-xs font-semibold text-zinc-600">{KEEP_MIN}-{KEEP_MAX}</div>
                  </div>
                  <input
                    type="range"
                    min={KEEP_MIN}
                    max={KEEP_MAX}
                    step={0.01}
                    value={keep}
                    onChange={(e) => setKeep(clampNum(Number(e.target.value), KEEP_MIN, KEEP_MAX))}
                    className="mt-3 w-full"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {KEEP_PRESETS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKeep(k)}
                        className={classNames(
                          "h-9 rounded-2xl border px-3 text-sm font-semibold",
                          Math.abs(keep - k) < 0.0001 ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                        )}
                      >
                        {formatKeep(k)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">AOV model</div>
                      <div className="text-xs text-zinc-600">Where the per-customer revenue numbers come from.</div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                      <input type="checkbox" checked={whale} onChange={(e) => setWhale(e.target.checked)} />
                      High-value
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <SegButton active={aovSource === "modules"} onClick={() => setAovSource("modules")}>Modules</SegButton>
                    <SegButton active={aovSource === "manual"} onClick={() => setAovSource("manual")}>Manual</SegButton>
                  </div>

                  {aovSource === "modules" ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl bg-zinc-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Computed AOV</div>
                            <div className="mt-1 text-sm font-semibold text-zinc-900">Uses portal module prices + credits assumptions.</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-zinc-600">Membership</div>
                            <div className="text-base font-bold text-zinc-900">{formatMoneyCompact(computedMembershipArpu)}</div>
                            <div className="mt-1 text-xs font-semibold text-zinc-600">Credits-only</div>
                            <div className="text-base font-bold text-zinc-900">{formatMoneyCompact(computedCreditsOnlyArpu)}</div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Service mix presets</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(Object.keys(SERVICE_MIX_PRESETS) as ServiceMixPresetKey[]).map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => {
                                setServiceMixPreset(k);
                                setModuleAdoptionPct(SERVICE_MIX_PRESETS[k].adoptionPct);
                                setCreditsPerMonthlyCustomer(SERVICE_MIX_PRESETS[k].creditsPerMonthlyCustomer);
                                setCreditsPerCreditCustomer(SERVICE_MIX_PRESETS[k].creditsPerCreditCustomer);
                              }}
                              className={classNames(
                                "h-9 rounded-2xl border px-3 text-sm font-semibold",
                                serviceMixPreset === k ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                              )}
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <div className="text-xs font-semibold text-zinc-600">$ per credit (subscription)</div>
                          <input
                            value={usdPerCreditSubscription}
                            onChange={(e) => setUsdPerCreditSubscription(clampNum(Number(e.target.value), 0, 10))}
                            inputMode="decimal"
                            className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                          />
                        </label>
                        <label className="block">
                          <div className="text-xs font-semibold text-zinc-600">$ per credit (credits-only)</div>
                          <input
                            value={usdPerCreditCreditsOnly}
                            onChange={(e) => setUsdPerCreditCreditsOnly(clampNum(Number(e.target.value), 0, 10))}
                            inputMode="decimal"
                            className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                          />
                        </label>
                        <label className="block">
                          <div className="text-xs font-semibold text-zinc-600">Credits / membership customer / mo</div>
                          <input
                            value={creditsPerMonthlyCustomer}
                            onChange={(e) => setCreditsPerMonthlyCustomer(Math.max(0, toInt(e.target.value, creditsPerMonthlyCustomer)))}
                            inputMode="numeric"
                            className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                          />
                        </label>
                        <label className="block">
                          <div className="text-xs font-semibold text-zinc-600">Credits / credits-only customer / mo</div>
                          <input
                            value={creditsPerCreditCustomer}
                            onChange={(e) => setCreditsPerCreditCustomer(Math.max(0, toInt(e.target.value, creditsPerCreditCustomer)))}
                            inputMode="numeric"
                            className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                          />
                        </label>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Adoption rates</div>
                            <div className="text-xs text-zinc-600">Percent of membership customers with each service.</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setModuleAdoptionPct(SERVICE_MIX_PRESETS.Standard.adoptionPct)}
                            className="h-9 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Reset rates
                          </button>
                        </div>

                        <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                          {moduleKeys
                            .filter((k) => k !== "crm")
                            .map((k) => (
                              <div key={k} className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-zinc-900">{PORTAL_MODULE_CATALOG[k].title}</div>
                                <div className="flex items-center gap-2">
                                  <input
                                    value={moduleAdoptionPct[k] ?? 0}
                                    onChange={(e) => {
                                      const next = clampNum(toInt(e.target.value, moduleAdoptionPct[k] ?? 0), 0, 100);
                                      setModuleAdoptionPct((prev) => ({ ...prev, [k]: next }));
                                    }}
                                    inputMode="numeric"
                                    className="h-9 w-20 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                                  />
                                  <div className="text-xs font-semibold text-zinc-600">%</div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <div className="text-xs font-semibold text-zinc-600">Membership (AOV)</div>
                        <input
                          value={whale ? ARPU_WHALE : monthlyArpu}
                          onChange={(e) => setMonthlyArpu(toInt(e.target.value, ARPU_DEFAULT_MONTHLY))}
                          inputMode="numeric"
                          disabled={whale}
                          className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400 disabled:opacity-60"
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-semibold text-zinc-600">Credits-only (AOV)</div>
                        <input
                          value={whale ? ARPU_WHALE : creditArpu}
                          onChange={(e) => setCreditArpu(toInt(e.target.value, ARPU_DEFAULT_CREDIT))}
                          inputMode="numeric"
                          disabled={whale}
                          className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400 disabled:opacity-60"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-zinc-900">Customer value created</div>
                  <div className="mt-1 text-xs text-zinc-600">Estimated monthly value created per enabled customer (USD).</div>
                  <div className="mt-3 max-h-80 space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                    {moduleKeys
                      .filter((k) => k !== "crm")
                      .map((k) => (
                        <div key={k} className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-zinc-900">{PORTAL_MODULE_CATALOG[k].title}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-semibold text-zinc-600">$</div>
                            <input
                              value={valueUsdPerEnabledCustomer[k] ?? 0}
                              onChange={(e) => {
                                const next = Math.max(0, Number(e.target.value));
                                setValueUsdPerEnabledCustomer((prev) => ({ ...prev, [k]: next }));
                              }}
                              inputMode="decimal"
                              className="h-9 w-28 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
                            />
                            <div className="text-xs font-semibold text-zinc-600">/ mo</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-zinc-900">Comparison</div>
                  <div className="mt-1 text-xs text-zinc-600">Same tier, different revenue styles.</div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[520px]">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          <th className="py-2">Style</th>
                          <th className="py-2">Customers</th>
                          <th className="py-2">Month 1 profit</th>
                          <th className="py-2">Total ({appliedMonths} mo)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonRows.map((r) => (
                          <tr key={r.mode} className="border-t border-zinc-200">
                            <td className="py-3 font-semibold text-zinc-900">
                              {r.mode === "monthly" ? "Membership" : r.mode === "credit" ? "Credits" : "Mixed"}
                            </td>
                            <td className="py-3 text-zinc-700">
                              {r.customers.toLocaleString()}
                              {r.mode === "combined" ? (
                                <div className="text-xs text-zinc-500">
                                  {r.monthlyCustomers.toLocaleString()} membership • {r.creditCustomers.toLocaleString()} credits
                                </div>
                              ) : null}
                            </td>
                            <td className="py-3 text-zinc-700">{formatMoneyCompact(r.profitMo)}</td>
                            <td className="py-3 text-zinc-700">{formatMoneyCompact(r.profitTime)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Snapshot text</div>
                  <div className="mt-2 text-sm text-zinc-800">{summaryLine}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
