"use client";

import { useMemo, useState } from "react";

type Mode = "monthly" | "credit" | "combined";

const MRR_PRESETS = [25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000] as const;
const MONTH_PRESETS = [1, 3, 6, 12] as const;

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

function Card(props: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{props.title}</div>
      <div className="mt-2 text-3xl font-bold text-white">{props.value}</div>
      {props.sub ? <div className="mt-1 text-xs text-white/50">{props.sub}</div> : null}
    </div>
  );
}

function PillButton(props: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={classNames(
        "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
        props.active
          ? "border-white/20 bg-white/15 text-white"
          : "border-white/10 bg-black/20 text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {props.children}
    </button>
  );
}

export default function ProfitVisualizationDashboardPage() {
  const [dark, setDark] = useState(true);

  const [mode, setMode] = useState<Mode>("combined");
  const [selectedMrr, setSelectedMrr] = useState<number>(100_000);
  const [customMrr, setCustomMrr] = useState<string>("");

  const [months, setMonths] = useState<number>(6);
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

  const scoreboardRows = useMemo(() => {
    return MRR_PRESETS.map((mrr) => {
      const profitMo = calcProfitPerMonth(mrr, keep);
      const c = customersNeeded({
        mrr,
        mode,
        monthlyArpu: effectiveMonthlyArpu,
        creditArpu: effectiveCreditArpu,
        monthlyShare,
      });
      return {
        mrr,
        profitMo,
        profit3: profitMo * 3,
        profit6: profitMo * 6,
        profit12: profitMo * 12,
        customers: c.customers,
        monthlyCustomers: c.monthlyCustomers,
        creditCustomers: c.creditCustomers,
      };
    });
  }, [keep, mode, effectiveMonthlyArpu, effectiveCreditArpu, monthlyShare]);

  const maxBar = useMemo(() => {
    const vals = scoreboardRows.map((r) => calcProfitOverTime(r.mrr, keep, months));
    return Math.max(1, ...vals);
  }, [scoreboardRows, keep, months]);

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
    setDark(true);
    setMode("combined");
    setSelectedMrr(100_000);
    setCustomMrr("");
    setMonths(6);
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

  const surface = dark
    ? {
        bg: "bg-[#070A12]",
        panel: "bg-white/5 border-white/10",
        text: "text-white",
        muted: "text-white/60",
        soft: "text-white/80",
        input: "bg-black/30 border-white/10 text-white placeholder:text-white/40",
      }
    : {
        bg: "bg-zinc-50",
        panel: "bg-white border-zinc-200",
        text: "text-zinc-900",
        muted: "text-zinc-500",
        soft: "text-zinc-800",
        input: "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400",
      };

  return (
    <div className={classNames(surface.bg, "min-h-screen")}> 
      <div className="mx-auto w-full max-w-7xl px-4 py-10">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className={classNames(surface.text, "text-2xl font-bold")}>Profit Visualization Dashboard</div>
            <div className={classNames(surface.muted, "mt-1 text-sm")}>Visualization only — feels like results already happened.</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className={classNames(
                "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                dark ? "border-white/10 bg-white/5 text-white hover:bg-white/10" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
              )}
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={() => void copySummary()}
              className={classNames(
                "rounded-2xl px-3 py-2 text-sm font-semibold transition",
                dark
                  ? "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95"
                  : "bg-zinc-900 text-white hover:bg-zinc-800",
              )}
            >
              Copy Summary
            </button>
            <button
              type="button"
              onClick={() => setDark((v) => !v)}
              className={classNames(
                "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                dark ? "border-white/10 bg-black/20 text-white/80 hover:bg-white/10" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
              )}
              aria-label="Toggle theme"
            >
              {dark ? "Dark" : "Light"}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
          {/* Controls */}
          <div className={classNames("rounded-3xl border p-6", surface.panel)}>
            <div className={classNames("text-sm font-semibold", surface.text)}>Controls</div>

            <div className="mt-5 grid gap-6">
              <div>
                <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Mode</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <PillButton active={mode === "monthly"} onClick={() => setMode("monthly")}>Monthly-fee</PillButton>
                  <PillButton active={mode === "credit"} onClick={() => setMode("credit")}>Credit-only</PillButton>
                  <PillButton active={mode === "combined"} onClick={() => setMode("combined")}>Combined</PillButton>
                </div>
              </div>

              <div>
                <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>MRR</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MRR_PRESETS.map((mrr) => (
                    <PillButton key={mrr} active={!customMrr.trim() && selectedMrr === mrr} onClick={() => {
                      setCustomMrr("");
                      setSelectedMrr(mrr);
                    }}>
                      {formatMoneyCompact(mrr)}
                    </PillButton>
                  ))}
                </div>
                <div className="mt-2">
                  <input
                    value={customMrr}
                    onChange={(e) => setCustomMrr(e.target.value)}
                    inputMode="numeric"
                    placeholder="Custom MRR (overrides preset)"
                    className={classNames("w-full rounded-2xl border px-3 py-2 text-sm outline-none", surface.input)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Timeframe</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MONTH_PRESETS.map((m) => (
                      <PillButton key={m} active={months === m} onClick={() => setMonths(m)}>
                        {m} mo
                      </PillButton>
                    ))}
                  </div>
                </div>

                <div>
                  <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Keep per $1 collected</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {KEEP_PRESETS.map((k) => (
                      <PillButton key={k} active={Math.abs(keep - k) < 0.0001} onClick={() => setKeep(k)}>
                        {formatKeep(k)}
                      </PillButton>
                    ))}
                  </div>
                </div>
              </div>

              <div className={classNames("rounded-2xl border p-4", dark ? "border-white/10 bg-black/20" : "border-zinc-200 bg-zinc-50")}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={classNames("text-sm font-semibold", surface.text)}>Keep</div>
                    <div className={classNames("mt-1 text-xs", surface.muted)}>Range {formatKeep(KEEP_MIN)} to {formatKeep(KEEP_MAX)} (don’t call it margin).</div>
                  </div>
                  <div className={classNames("text-lg font-bold", surface.text)}>{formatKeep(keep)}</div>
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
              </div>

              <div>
                <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>ARPU (editable)</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <div className={classNames("text-xs font-semibold", surface.muted)}>Monthly-fee ARPU / mo</div>
                    <input
                      value={whale ? ARPU_WHALE : monthlyArpu}
                      onChange={(e) => setMonthlyArpu(toInt(e.target.value, ARPU_DEFAULT_MONTHLY))}
                      inputMode="numeric"
                      disabled={whale}
                      className={classNames("mt-1 w-full rounded-2xl border px-3 py-2 text-sm outline-none disabled:opacity-60", surface.input)}
                    />
                  </label>
                  <label className="block">
                    <div className={classNames("text-xs font-semibold", surface.muted)}>Credit-only ARPU / mo</div>
                    <input
                      value={whale ? ARPU_WHALE : creditArpu}
                      onChange={(e) => setCreditArpu(toInt(e.target.value, ARPU_DEFAULT_CREDIT))}
                      inputMode="numeric"
                      disabled={whale}
                      className={classNames("mt-1 w-full rounded-2xl border px-3 py-2 text-sm outline-none disabled:opacity-60", surface.input)}
                    />
                  </label>
                </div>

                <label className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <div className={classNames("text-sm font-semibold", surface.text)}>Whale ARPU</div>
                    <div className={classNames("text-xs", surface.muted)}>Toggle to {formatMoneyCompact(ARPU_WHALE)}/mo.</div>
                  </div>
                  <input type="checkbox" checked={whale} onChange={(e) => setWhale(e.target.checked)} />
                </label>
              </div>

              {mode === "combined" ? (
                <div>
                  <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Combined mix (must sum to 100%)</div>
                  <div className={classNames("mt-2 rounded-2xl border p-4", dark ? "border-white/10 bg-black/20" : "border-zinc-200 bg-zinc-50")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className={classNames("text-sm font-semibold", surface.text)}>Monthly-fee share</div>
                      <div className={classNames("text-sm font-bold", surface.text)}>{Math.round(monthlyShare * 100)}%</div>
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
                    <div className={classNames("mt-2 text-xs", surface.muted)}>
                      Credit-only share auto: <span className={classNames("font-semibold", surface.soft)}>{Math.round(creditShare * 100)}%</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={classNames("rounded-3xl border p-5", surface.panel)}>
                <div className={classNames("text-sm font-semibold", surface.text)}>Pricing Assumptions</div>
                <div className={classNames("mt-1 text-xs", surface.muted)}>Editable reference only (no billing).</div>

                <div className="mt-4 grid gap-5">
                  <div>
                    <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Monthly-fee bundles</div>
                    <div className={classNames("mt-2 grid gap-1 text-sm", surface.soft)}>
                      <div className="flex items-center justify-between"><span>Hook Stack</span><span className={classNames("font-semibold", surface.text)}>$147</span></div>
                      <div className="flex items-center justify-between"><span>Marketing Engine</span><span className={classNames("font-semibold", surface.text)}>$406</span></div>
                      <div className="flex items-center justify-between"><span>Sales Machine</span><span className={classNames("font-semibold", surface.text)}>$296</span></div>
                      <div className="flex items-center justify-between"><span>Everything On</span><span className={classNames("font-semibold", surface.text)}>$840</span></div>
                    </div>
                  </div>

                  <div>
                    <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Monthly-fee usage add-ons</div>
                    <div className={classNames("mt-2 grid gap-1 text-sm", surface.soft)}>
                      <div className="flex items-center justify-between"><span>Low usage</span><span className={classNames("font-semibold", surface.text)}>$50</span></div>
                      <div className="flex items-center justify-between"><span>Medium usage</span><span className={classNames("font-semibold", surface.text)}>$200</span></div>
                      <div className="flex items-center justify-between"><span>High usage</span><span className={classNames("font-semibold", surface.text)}>$600</span></div>
                    </div>
                  </div>

                  <div>
                    <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Credits (price per credit)</div>
                    <div className={classNames("mt-2 grid gap-1 text-sm", surface.soft)}>
                      <div className="flex items-center justify-between"><span>Monthly-fee credit price</span><span className={classNames("font-semibold", surface.text)}>$0.10</span></div>
                      <div className="flex items-center justify-between"><span>Credit-only credit price</span><span className={classNames("font-semibold", surface.text)}>$0.20</span></div>
                    </div>
                  </div>

                  <div>
                    <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Credit burns (reference)</div>
                    <div className={classNames("mt-2 grid gap-1 text-xs", surface.soft)}>
                      <div className="flex items-center justify-between"><span>AI Receptionist</span><span className={classNames("font-semibold", surface.text)}>5 credits / minute</span></div>
                      <div className="flex items-center justify-between"><span>Outbound attempt</span><span className={classNames("font-semibold", surface.text)}>10 credits / attempt</span></div>
                      <div className="flex items-center justify-between"><span>Outbound talk time</span><span className={classNames("font-semibold", surface.text)}>5 credits / minute</span></div>
                      <div className="flex items-center justify-between"><span>AI message gen</span><span className={classNames("font-semibold", surface.text)}>1 credit / message</span></div>
                      <div className="flex items-center justify-between"><span>Follow-up sequence gen</span><span className={classNames("font-semibold", surface.text)}>5 credits / sequence</span></div>
                      <div className="flex items-center justify-between"><span>Newsletter send</span><span className={classNames("font-semibold", surface.text)}>30 credits / send</span></div>
                      <div className="flex items-center justify-between"><span>Blog post</span><span className={classNames("font-semibold", surface.text)}>50 credits / post</span></div>
                      <div className="flex items-center justify-between"><span>B2B lead</span><span className={classNames("font-semibold", surface.text)}>20 credits / lead</span></div>
                      <div className="flex items-center justify-between"><span>B2C lead</span><span className={classNames("font-semibold", surface.text)}>30 credits / lead</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Card title="Selected MRR" value={formatMoneyCompact(appliedMrr)} sub="Monthly recurring revenue" />
              <Card title="Keep per $1" value={formatKeep(keep)} sub="(Don’t call it margin)" />
              <Card title="Profit / month" value={formatMoneyCompact(profitMo)} sub={`${formatPct(keep)} of MRR`} />
              <Card title={`Profit / ${months} mo`} value={formatMoneyCompact(profitTime)} sub="Profit over timeframe" />
              <Card
                title="Customers needed"
                value={cust.customers.toLocaleString()}
                sub={
                  mode === "combined"
                    ? `${cust.monthlyCustomers.toLocaleString()} monthly • ${cust.creditCustomers.toLocaleString()} credit`
                    : mode === "monthly"
                      ? `Monthly-fee ARPU ${formatMoneyCompact(effectiveMonthlyArpu)}`
                      : `Credit-only ARPU ${formatMoneyCompact(effectiveCreditArpu)}`
                }
              />
            </div>

            <div className={classNames("rounded-3xl border p-6", surface.panel)}>
              <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <div className={classNames("text-sm font-semibold", surface.text)}>Main Scoreboard</div>
                  <div className={classNames("mt-1 text-xs", surface.muted)}>Rows = MRR presets. Tables & big numbers over charts.</div>
                </div>
                <div className={classNames("text-xs", surface.muted)}>
                  Customers calc uses current mode + ARPU inputs.
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[860px] border-separate border-spacing-y-2">
                  <thead>
                    <tr className={classNames("text-left text-xs font-semibold uppercase tracking-wide", surface.muted)}>
                      <th className="px-3 py-2">MRR</th>
                      <th className="px-3 py-2">Profit/mo</th>
                      <th className="px-3 py-2">Profit 3 mo</th>
                      <th className="px-3 py-2">Profit 6 mo</th>
                      <th className="px-3 py-2">Profit 12 mo</th>
                      <th className="px-3 py-2">Customers</th>
                      {mode === "combined" ? (
                        <>
                          <th className="px-3 py-2">Monthly customers</th>
                          <th className="px-3 py-2">Credit-only customers</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {scoreboardRows.map((r) => {
                      const active = r.mrr === selectedMrr && !customMrr.trim();
                      return (
                        <tr
                          key={r.mrr}
                          className={classNames(
                            "rounded-2xl",
                            dark
                              ? active
                                ? "bg-white/10"
                                : "bg-white/5 hover:bg-white/10"
                              : active
                                ? "bg-zinc-100"
                                : "bg-white hover:bg-zinc-50",
                          )}
                        >
                          <td className={classNames("px-3 py-3 font-semibold", surface.text)}>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomMrr("");
                                setSelectedMrr(r.mrr);
                              }}
                              className={classNames(
                                "w-full text-left",
                                dark ? "hover:opacity-90" : "hover:opacity-80",
                              )}
                            >
                              {formatMoneyCompact(r.mrr)}
                            </button>
                          </td>
                          <td className={classNames("px-3 py-3 font-semibold", surface.text)}>{formatMoneyCompact(r.profitMo)}</td>
                          <td className={classNames("px-3 py-3", surface.soft)}>{formatMoneyCompact(r.profit3)}</td>
                          <td className={classNames("px-3 py-3", surface.soft)}>{formatMoneyCompact(r.profit6)}</td>
                          <td className={classNames("px-3 py-3", surface.soft)}>{formatMoneyCompact(r.profit12)}</td>
                          <td className={classNames("px-3 py-3 font-semibold", surface.text)}>{r.customers.toLocaleString()}</td>
                          {mode === "combined" ? (
                            <>
                              <td className={classNames("px-3 py-3", surface.soft)}>{r.monthlyCustomers.toLocaleString()}</td>
                              <td className={classNames("px-3 py-3", surface.soft)}>{r.creditCustomers.toLocaleString()}</td>
                            </>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className={classNames("rounded-3xl border p-6", surface.panel)}>
                <div className={classNames("text-sm font-semibold", surface.text)}>Mode Comparison</div>
                <div className={classNames("mt-1 text-xs", surface.muted)}>
                  For selected MRR: customers needed + profit.
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px]">
                    <thead>
                      <tr className={classNames("text-left text-xs font-semibold uppercase tracking-wide", surface.muted)}>
                        <th className="py-2">Mode</th>
                        <th className="py-2">Customers</th>
                        <th className="py-2">Profit/mo</th>
                        <th className="py-2">Profit timeframe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((r) => (
                        <tr key={r.mode} className={classNames("border-t", dark ? "border-white/10" : "border-zinc-200")}>
                          <td className={classNames("py-3 font-semibold", surface.text)}>
                            {r.mode === "monthly" ? "Monthly-fee" : r.mode === "credit" ? "Credit-only" : "Combined"}
                          </td>
                          <td className={classNames("py-3", surface.soft)}>
                            {r.customers.toLocaleString()}
                            {r.mode === "combined" ? (
                              <div className={classNames("text-xs", surface.muted)}>
                                {r.monthlyCustomers.toLocaleString()} monthly • {r.creditCustomers.toLocaleString()} credit
                              </div>
                            ) : null}
                          </td>
                          <td className={classNames("py-3", surface.soft)}>{formatMoneyCompact(r.profitMo)}</td>
                          <td className={classNames("py-3", surface.soft)}>{formatMoneyCompact(r.profitTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={classNames("rounded-3xl border p-6", surface.panel)}>
                <div className={classNames("text-sm font-semibold", surface.text)}>Mini Chart</div>
                <div className={classNames("mt-1 text-xs", surface.muted)}>
                  Profit over selected timeframe across MRR presets.
                </div>

                <div className="mt-4 grid gap-2">
                  {scoreboardRows.map((r) => {
                    const v = calcProfitOverTime(r.mrr, keep, months);
                    const w = Math.max(2, Math.round((v / maxBar) * 100));
                    return (
                      <div key={r.mrr} className="grid grid-cols-[110px_1fr_120px] items-center gap-3">
                        <div className={classNames("text-xs font-semibold", surface.muted)}>{formatMoneyCompact(r.mrr)}</div>
                        <div className={classNames("h-3 rounded-full", dark ? "bg-white/10" : "bg-zinc-200")}>
                          <div
                            className={classNames("h-3 rounded-full", dark ? "bg-[color:var(--color-brand-blue)]" : "bg-zinc-900")}
                            style={{ width: `${w}%` }}
                          />
                        </div>
                        <div className={classNames("text-right text-xs font-semibold", surface.soft)}>{formatMoneyCompact(v)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={classNames("rounded-3xl border p-5", surface.panel)}>
              <div className={classNames("text-xs font-semibold uppercase tracking-wide", surface.muted)}>Copy Summary Preview</div>
              <div className={classNames("mt-2 text-sm", surface.soft)}>{summaryLine}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
