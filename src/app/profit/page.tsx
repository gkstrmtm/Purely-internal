"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Mode = "monthly" | "credit" | "combined";

const MRR_PRESETS = [25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000] as const;
const MONTH_PRESETS = [3, 6, 12] as const;

const KEEP_PRESETS = [0.85, 0.9] as const;
const KEEP_DEFAULT = 0.88;
const KEEP_MIN = 0.7;
const KEEP_MAX = 0.92;

const ARPU_DEFAULT_MONTHLY = 606;
const ARPU_DEFAULT_CREDIT = 800;
const ARPU_WHALE = 2500;

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

function formatPct(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `${Math.round(v * 100)}%`;
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

function calcProfitOverTime(mrr: number, keep: number, months: number) {
  return calcProfitPerMonth(mrr, keep) * months;
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

function SparkArea(props: {
  values: number[];
  stroke?: string;
  height?: number;
}) {
  const height = props.height ?? 96;
  const width = 320;

  const d = useMemo(() => {
    const vals = props.values.length ? props.values : [0];
    const max = Math.max(1, ...vals);
    const min = Math.min(0, ...vals);
    const span = Math.max(1, max - min);

    const stepX = vals.length <= 1 ? 0 : width / (vals.length - 1);
    const pts = vals.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return [x, y] as const;
    });

    const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `M 0 ${height} L ${line} L ${width} ${height} Z`;
    return { line, area };
  }, [props.values, height]);

  const stroke = props.stroke ?? "var(--color-brand-blue)";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="profitArea" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <path d={d.area} fill="url(#profitArea)" />
      <polyline points={d.line} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
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
  const [mode, setMode] = useState<Mode>("combined");
  const [selectedMrr, setSelectedMrr] = useState<number>(100_000);
  const [customMrr, setCustomMrr] = useState<string>("");

  const [months, setMonths] = useState<number>(3);
  const [keep, setKeep] = useState<number>(KEEP_DEFAULT);

  const [monthlyArpu, setMonthlyArpu] = useState<number>(ARPU_DEFAULT_MONTHLY);
  const [creditArpu, setCreditArpu] = useState<number>(ARPU_DEFAULT_CREDIT);
  const [whale, setWhale] = useState(false);

  const [monthlySharePct, setMonthlySharePct] = useState<number>(60);

  const appliedMrr = useMemo(() => {
    const c = customMrr.trim();
    if (!c) return selectedMrr;
    const n = Number(c.replaceAll(",", ""));
    if (!Number.isFinite(n)) return selectedMrr;
    return Math.max(0, Math.floor(n));
  }, [customMrr, selectedMrr]);

  const effectiveMonthlyArpu = whale ? ARPU_WHALE : Math.max(1, Math.floor(monthlyArpu || 0));
  const effectiveCreditArpu = whale ? ARPU_WHALE : Math.max(1, Math.floor(creditArpu || 0));

  const monthlyShare = clampNum(monthlySharePct / 100, 0, 1);
  const creditShare = 1 - monthlyShare;

  const profitMo = calcProfitPerMonth(appliedMrr, keep);
  const profitTime = calcProfitOverTime(appliedMrr, keep, months);

  const cust = customersNeeded({
    mrr: appliedMrr,
    mode,
    monthlyArpu: effectiveMonthlyArpu,
    creditArpu: effectiveCreditArpu,
    monthlyShare,
  });

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
        profitMo: calcProfitPerMonth(appliedMrr, keep),
        profitTime: calcProfitOverTime(appliedMrr, keep, months),
      };
    });
  }, [appliedMrr, keep, months, effectiveMonthlyArpu, effectiveCreditArpu, monthlyShare]);

  const summaryLine = useMemo(() => {
    const labelMrr = appliedMrr >= 1_000_000 ? `${appliedMrr / 1_000_000}M` : `${Math.round(appliedMrr / 1000)}k`;
    const profitMoK = Math.round(profitMo / 1000);
    const profitTimeK = Math.round(profitTime / 1000);

    if (mode !== "combined") {
      const modeLabel = mode === "monthly" ? "Monthly-fee" : "Credit-only";
      const arpuLabel = mode === "monthly" ? effectiveMonthlyArpu : effectiveCreditArpu;
      return `At $${labelMrr} MRR keeping ${formatKeep(keep)} per $1: profit/mo $${profitMoK}k, profit ${months}mo $${profitTimeK}k. ${modeLabel} ARPU ${arpuLabel}: customers ${cust.customers}.`;
    }

    const customers = cust.customers;
    const monthlyCustomers = cust.monthlyCustomers;
    const creditCustomers = cust.creditCustomers;
    return `At $${labelMrr} MRR keeping ${formatKeep(keep)} per $1: profit/mo $${profitMoK}k, profit ${months}mo $${profitTimeK}k. Combined ${Math.round(monthlyShare * 100)}/${Math.round(creditShare * 100)} with ARPU ${effectiveMonthlyArpu}/${effectiveCreditArpu}: customers ${customers} (${monthlyCustomers} monthly, ${creditCustomers} credit).`;
  }, [appliedMrr, keep, profitMo, profitTime, months, mode, cust, effectiveMonthlyArpu, effectiveCreditArpu, monthlyShare, creditShare]);

  function reset() {
    setMode("combined");
    setSelectedMrr(100_000);
    setCustomMrr("");
    setMonths(3);
    setKeep(KEEP_DEFAULT);
    setMonthlyArpu(ARPU_DEFAULT_MONTHLY);
    setCreditArpu(ARPU_DEFAULT_CREDIT);
    setWhale(false);
    setMonthlySharePct(60);
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
              <Image src="/brand/purity-5.png" alt="Purely" fill className="object-contain p-1.5" priority />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-zinc-900">Profit dashboard</div>
              <div className="mt-0.5 text-sm text-zinc-600">Pick a tier. See the profit. Move on.</div>
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
              onClick={() => void copySummary()}
              className="h-10 rounded-2xl bg-[color:var(--color-brand-blue)] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              Copy snapshot
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_1fr]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Monthly revenue</div>
              <div className="mt-2 flex flex-wrap gap-2">
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

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Timeframe</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MONTH_PRESETS.map((m) => (
                  <SegButton key={m} active={months === m} onClick={() => setMonths(m)}>
                    {m} months
                  </SegButton>
                ))}
              </div>
              <div className="mt-3 text-xs text-zinc-600">
                Monthly profit × months.
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Revenue style</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <SegButton active={mode === "monthly"} onClick={() => setMode("monthly")}>Membership</SegButton>
                <SegButton active={mode === "credit"} onClick={() => setMode("credit")}>Credits</SegButton>
                <SegButton active={mode === "combined"} onClick={() => setMode("combined")}>Mixed</SegButton>
              </div>
              <div className="mt-3">
                <DonutMix aPct={mode === "credit" ? 0 : mode === "monthly" ? 100 : Math.round(monthlyShare * 100)} aLabel="Membership" bLabel="Credits" />
              </div>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SurfaceCard title="Selected tier" value={formatMoneyCompact(appliedMrr)} sub="Monthly recurring revenue" accent="ink" />
              <SurfaceCard title="Net retained" value={formatPct1(keep)} sub={`${formatKeep(keep)} per $1 collected`} accent="blue" />
              <SurfaceCard title="Profit per month" value={formatMoneyCompact(profitMo)} sub="Run-rate" accent="pink" />
              <SurfaceCard title={`Profit (${months} months)`} value={formatMoneyCompact(profitTime)} sub="Total" accent="blue" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Profit curve</div>
                    <div className="mt-1 text-xs text-zinc-600">Cumulative profit across the timeframe.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total</div>
                    <div className="text-lg font-bold text-zinc-900">{formatMoneyCompact(profitTime)}</div>
                  </div>
                </div>
                <div className="mt-4 h-28">
                  <SparkArea
                    values={Array.from({ length: Math.max(1, months) }, (_, i) => (i + 1) * profitMo)}
                    stroke="var(--color-brand-blue)"
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <div className="font-semibold text-zinc-900">Month 1</div>
                    <div className="text-zinc-600">{formatMoneyCompact(profitMo)}</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <div className="font-semibold text-zinc-900">Month {Math.min(3, months)}</div>
                    <div className="text-zinc-600">{formatMoneyCompact(calcProfitOverTime(appliedMrr, keep, Math.min(3, months)))}</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <div className="font-semibold text-zinc-900">Month {months}</div>
                    <div className="text-zinc-600">{formatMoneyCompact(profitTime)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Monthly profit</div>
                    <div className="mt-1 text-xs text-zinc-600">Same run-rate each month (simple view).</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Per month</div>
                    <div className="text-lg font-bold text-zinc-900">{formatMoneyCompact(profitMo)}</div>
                  </div>
                </div>
                <div className="mt-4 h-20">
                  <MiniBars
                    values={Array.from({ length: Math.max(1, months) }, () => profitMo)}
                    color="var(--color-brand-ink)"
                  />
                </div>
                <div className="mt-4 rounded-2xl bg-gradient-to-br from-[color:var(--color-brand-blue)]/10 to-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Quick read</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {formatMoneyCompact(profitMo)} / month → {formatMoneyCompact(profitTime)} in {months} months
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Customer math</div>
                  <div className="mt-1 text-xs text-zinc-600">How many customers it takes to hit the selected tier.</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Needed</div>
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Profit per customer</div>
                  <div className="mt-2 text-2xl font-bold text-zinc-900">
                    {formatMoneyCompact(cust.customers ? profitMo / cust.customers : 0)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">(monthly profit / customers)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">Assumptions</div>
              <div className="mt-1 text-xs text-zinc-600">Tweak these if you need it tighter.</div>

              <div className="mt-5 grid gap-5">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Net retained</div>
                      <div className="text-xs text-zinc-600">How much you keep from each $1.</div>
                    </div>
                    <div className="text-sm font-bold text-zinc-900">{formatKeep(keep)} ({formatPct1(keep)})</div>
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

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Customer value</div>
                      <div className="text-xs text-zinc-600">Average monthly revenue per customer.</div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                      <input type="checkbox" checked={whale} onChange={(e) => setWhale(e.target.checked)} />
                      High-value
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <div className="text-xs font-semibold text-zinc-600">Membership</div>
                      <input
                        value={whale ? ARPU_WHALE : monthlyArpu}
                        onChange={(e) => setMonthlyArpu(toInt(e.target.value, ARPU_DEFAULT_MONTHLY))}
                        inputMode="numeric"
                        disabled={whale}
                        className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400 disabled:opacity-60"
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-semibold text-zinc-600">Credits</div>
                      <input
                        value={whale ? ARPU_WHALE : creditArpu}
                        onChange={(e) => setCreditArpu(toInt(e.target.value, ARPU_DEFAULT_CREDIT))}
                        inputMode="numeric"
                        disabled={whale}
                        className="mt-1 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400 disabled:opacity-60"
                      />
                    </label>
                  </div>
                </div>

                {mode === "combined" ? (
                  <div>
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
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">Comparison</div>
              <div className="mt-1 text-xs text-zinc-600">Same tier, different revenue styles.</div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <th className="py-2">Style</th>
                      <th className="py-2">Customers</th>
                      <th className="py-2">Profit / mo</th>
                      <th className="py-2">Profit ({months} mo)</th>
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
    </div>
  );
}
