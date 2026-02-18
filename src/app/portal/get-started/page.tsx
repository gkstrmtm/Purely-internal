"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  GET_STARTED_GOALS,
  goalLabelsFromIds,
  normalizeGoalIds,
  recommendPortalServiceSlugs,
} from "@/lib/portalGetStartedRecommendations";
import {
  BUSINESS_MODEL_SUGGESTIONS,
  INDUSTRY_SUGGESTIONS,
  ONBOARDING_UPFRONT_PAID_PLAN_IDS,
  PORTAL_ONBOARDING_PLANS,
  monthlyTotalUsd as catalogMonthlyTotalUsd,
  oneTimeTotalUsd as catalogOneTimeTotalUsd,
  planQuantity,
  planById,
} from "@/lib/portalOnboardingWizardCatalog";
import { formatUsd } from "@/lib/pricing.shared";

const STEPS = ["Business", "Goals", "Services", "Account"] as const;

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function moneyLabel(monthlyUsd: number) {
  if (!monthlyUsd || monthlyUsd <= 0) return "$0/mo";
  return `${formatUsd(monthlyUsd, { maximumFractionDigits: 0 })}/mo`;
}

export default function PortalGetStartedPage() {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();

  const checkoutState = (search?.get("checkout") || "").trim().toLowerCase();
  useEffect(() => {
    if (checkoutState === "cancel") {
      toast.error("Checkout canceled");
    }
  }, [checkoutState, toast]);

  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  const [goalIds, setGoalIds] = useState<string[]>([]);
  const normalizedGoals = normalizeGoalIds(goalIds);
  const recommendedServiceSlugs = recommendPortalServiceSlugs(normalizedGoals);

  const planIdsByRecommendedSlug = new Map<string, string>([
    ["booking", "booking"],
    ["reviews", "reviews"],
    ["blogs", "blogs"],
    ["automations", "automations"],
    ["ai-receptionist", "ai-receptionist"],
    ["ai-outbound-calls", "ai-outbound"],
    // Default lead scraping recommendation goes to B2B.
    ["lead-scraping", "lead-scraping-b2b"],
  ]);

  const recommendedPlanIds = Array.from(
    new Set(
      recommendedServiceSlugs
        .map((slug) => planIdsByRecommendedSlug.get(slug) || "")
        .filter(Boolean),
    ),
  ).slice(0, 6);

  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>(["core"]);
  const [planQuantities, setPlanQuantities] = useState<Record<string, number>>({});
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const normalizedCoupon = couponCode.trim().toUpperCase();
  const couponIsRichard = normalizedCoupon === "RICHARD";
  const couponIsBuild = normalizedCoupon === "BUILD";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (selectionTouched) return;
    setSelectedPlanIds(Array.from(new Set(["core", ...recommendedPlanIds])));
  }, [recommendedPlanIds, selectionTouched]);

  useEffect(() => {
    // BUILD coupon: free bundle access for testing.
    if (!couponIsBuild) return;
    setSelectionTouched(true);
    setSelectedPlanIds((prev) => Array.from(new Set(["core", "ai-receptionist", "reviews", ...prev])));
  }, [couponIsBuild]);

  useEffect(() => {
    // Keep quantities in sync with selection.
    setPlanQuantities((prev) => {
      const next: Record<string, number> = {};
      for (const id of selectedPlanIds) {
        const p = planById(id);
        if (!p?.quantityConfig) continue;
        next[id] = typeof prev[id] === "number" ? prev[id] : p.quantityConfig.default;
      }
      return next;
    });
  }, [selectedPlanIds]);

  function toggleGoal(id: string) {
    setGoalIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return Array.from(s);
    });
  }

  function togglePlan(id: string) {
    if (couponIsBuild && (id === "ai-receptionist" || id === "reviews")) return;
    setSelectionTouched(true);
    setSelectedPlanIds((prev) => {
      const s = new Set(prev);
      if (id === "core") return Array.from(s);

      if (s.has(id)) s.delete(id);
      else s.add(id);

      // Lead scraping plans are mutually exclusive.
      if (id === "lead-scraping-b2b" && s.has("lead-scraping-b2c")) s.delete("lead-scraping-b2c");
      if (id === "lead-scraping-b2c" && s.has("lead-scraping-b2b")) s.delete("lead-scraping-b2b");

      // Always keep Core.
      s.add("core");
      return Array.from(s);
    });

    const p = planById(id);
    if (p?.quantityConfig) {
      setPlanQuantities((prev) => ({
        ...prev,
        [id]: typeof prev[id] === "number" ? prev[id] : p.quantityConfig!.default,
      }));
    }
  }

  const selectedPlans = selectedPlanIds
    .map((id) => planById(id))
    .filter((p): p is NonNullable<ReturnType<typeof planById>> => Boolean(p));

  const upfrontPaidPlanIds = selectedPlanIds.filter((id) => (ONBOARDING_UPFRONT_PAID_PLAN_IDS as readonly string[]).includes(id));

  const billablePlanIds = couponIsRichard
    ? []
    : couponIsBuild
      ? upfrontPaidPlanIds.filter((id) => id !== "ai-receptionist" && id !== "reviews")
      : upfrontPaidPlanIds;

  const monthlyTotalUsd = catalogMonthlyTotalUsd(billablePlanIds, planQuantities);
  const oneTimeTotalUsd = catalogOneTimeTotalUsd(billablePlanIds, planQuantities);
  const dueTodayUsd = monthlyTotalUsd + oneTimeTotalUsd;
  const monthlyThereafterUsd = monthlyTotalUsd;

  const selectedServiceSlugs = Array.from(
    new Set(
      selectedPlans.flatMap((p) => p.serviceSlugsToActivate),
    ),
  );

  const canGoNext = (() => {
    if (step === 0) return businessName.trim().length >= 2;
    if (step === 1) return true;
    if (step === 2) return selectedPlanIds.includes("core");
    if (step === 3) {
      return name.trim().length >= 2 && email.trim().length >= 3 && password.trim().length >= 6;
    }
    return false;
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/client-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        password,
        businessName,
        websiteUrl,
        industry,
        businessModel,
        targetCustomer,
        brandVoice,
        goalIds: normalizedGoals,
        selectedServiceSlugs,
        selectedPlanIds,
        selectedPlanQuantities: planQuantities,
        couponCode: normalizedCoupon,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setError(body?.error ?? "Unable to create account");
      return;
    }

    toast.success("Account created");

    const checkoutRes = await fetch("/api/portal/billing/onboarding-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planIds: upfrontPaidPlanIds,
        planQuantities: planQuantities,
        couponCode: normalizedCoupon,
      }),
    });

    const checkoutJson = await checkoutRes.json().catch(() => null);
    setLoading(false);

    if (checkoutJson?.ok && checkoutJson?.bypass) {
      const confirmRes = await fetch("/api/portal/billing/onboarding-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bypass: true }),
      });
      const confirmJson = await confirmRes.json().catch(() => null);
      if (!confirmRes.ok || !confirmJson?.ok) {
        setError(confirmJson?.error || "Unable to activate services");
        router.push("/portal/login");
        return;
      }

      toast.success("Welcome to your portal");
      router.push("/portal/app/billing");
      return;
    }

    if (!checkoutRes.ok || !checkoutJson?.ok || !checkoutJson?.url) {
      const msg = checkoutJson?.error || (checkoutRes.status === 401 ? "Unauthorized" : "Unable to start checkout");
      toast.error(msg);
      setError(msg);
      if (checkoutRes.status === 401 || checkoutRes.status === 403) {
        router.push("/portal/login");
        return;
      }

      router.push("/portal/app/billing");
      router.refresh();
      return;
    }

    window.location.assign(String(checkoutJson.url));
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={520}
              height={160}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </div>

          <p className="mt-6 text-base text-zinc-600">Set up your portal in a few quick steps.</p>

          <div className="mt-6 flex items-center justify-between gap-2">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => (i <= step ? setStep(i) : null)}
                className={classNames(
                  "flex-1 rounded-full border px-3 py-2 text-xs font-semibold",
                  i === step
                    ? "border-brand-ink bg-brand-ink text-white"
                    : i < step
                      ? "border-zinc-200 bg-zinc-50 text-zinc-700"
                      : "border-zinc-200 bg-white text-zinc-400",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-6" onSubmit={onSubmit}>
            {step === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Business basics</div>
                <div className="mt-1 text-sm text-zinc-600">We use this to personalize your portal and recommendations.</div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-base font-medium">Business name</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">Website (optional)</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://yourbusiness.com"
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">Industry (optional)</label>
                    <input
                      list="industry-suggestions"
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="Type to search…"
                    />
                    <datalist id="industry-suggestions">
                      {INDUSTRY_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-base font-medium">Business model (optional)</label>
                    <input
                      list="business-model-suggestions"
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={businessModel}
                      onChange={(e) => setBusinessModel(e.target.value)}
                      placeholder="Type to search…"
                    />
                    <datalist id="business-model-suggestions">
                      {BUSINESS_MODEL_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-base font-medium">Target customer (optional)</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={targetCustomer}
                      onChange={(e) => setTargetCustomer(e.target.value)}
                      placeholder="Who do you primarily serve?"
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">Brand voice (optional)</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={brandVoice}
                      onChange={(e) => setBrandVoice(e.target.value)}
                      placeholder="Friendly, professional, direct…"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Top goals</div>
                <div className="mt-1 text-sm text-zinc-600">Pick what you care about most right now.</div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  {GET_STARTED_GOALS.map((g) => {
                    const checked = normalizedGoals.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGoal(g.id)}
                        className={classNames(
                          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left",
                          checked ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                        )}
                      >
                        <div className="text-sm font-semibold text-zinc-900">{g.label}</div>
                        <div
                          className={classNames(
                            "h-4 w-4 rounded border",
                            checked ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-white",
                          )}
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-xs text-zinc-500">Selected: {goalLabelsFromIds(normalizedGoals).join(", ") || "None yet"}</div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Services</div>
                <div className="mt-1 text-sm text-zinc-600">
                  We recommend a starting set. You can change this anytime.
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Coupon code</div>
                        <div className="mt-1 text-xs text-zinc-500">Optional: you can also enter a promo code at checkout.</div>
                      </div>

                      <input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Enter code"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400 sm:w-64"
                      />
                    </div>

                    {couponIsRichard ? (
                      <div className="mt-2 text-xs font-semibold text-emerald-700">RICHARD applied; everything is free for testing.</div>
                    ) : null}
                    {couponIsBuild ? (
                      <div className="mt-2 text-xs font-semibold text-emerald-700">
                        BUILD applied; free bundle enabled (Core + AI Receptionist + Reviews).
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Core Portal</div>
                        <div className="mt-1 text-sm text-zinc-600">Includes Inbox/Outbox, Media Library, Tasks, and Reporting.</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-zinc-900">{moneyLabel(39)}</div>
                        <div className="mt-1 text-xs text-zinc-500">Required</div>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-zinc-600">Recommended</div>
                  <div className="grid grid-cols-1 gap-3">
                    {(recommendedPlanIds.length ? recommendedPlanIds : ["automations"]).map((id) => {
                      const p = planById(id);
                      if (!p) return null;
                      const checked = selectedPlanIds.includes(id);
                      const qty = planQuantity(p, planQuantities);
                      const buildFree = couponIsBuild && (id === "ai-receptionist" || id === "reviews");
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => togglePlan(id)}
                          disabled={couponIsBuild && (id === "ai-receptionist" || id === "reviews")}
                          className={classNames(
                            "flex w-full items-start justify-between gap-4 rounded-2xl border p-4 text-left",
                            checked ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                            couponIsBuild && (id === "ai-receptionist" || id === "reviews") ? "cursor-not-allowed opacity-70" : "",
                          )}
                        >
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">{p.title}</div>
                            <div className="mt-1 text-sm text-zinc-600">{p.description}</div>
                            {checked && p.quantityConfig ? (
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                                <div className="font-semibold text-zinc-700">{p.quantityConfig.label}</div>
                                <input
                                  type="number"
                                  min={p.quantityConfig.min}
                                  max={p.quantityConfig.max}
                                  value={qty}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setSelectionTouched(true);
                                    const n = Number(e.target.value);
                                    setPlanQuantities((prev) => ({ ...prev, [p.id]: n }));
                                  }}
                                  className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                                />
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-zinc-900">{buildFree ? "$0/mo" : moneyLabel(p.monthlyUsd)}</div>
                            {p.oneTimeUsd && !buildFree ? (
                              <div className="mt-1 text-xs font-semibold text-zinc-600">+{formatUsd(p.oneTimeUsd, { maximumFractionDigits: 0 })} setup</div>
                            ) : null}
                            <div
                              className={classNames(
                                "mt-3 h-4 w-4 rounded border",
                                checked ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-white",
                              )}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="text-sm font-semibold text-brand-ink hover:underline"
                    onClick={() => setShowAllServices((v) => !v)}
                  >
                    {showAllServices ? "Hide all services" : "See all services"}
                  </button>

                  {showAllServices ? (
                    <div className="grid grid-cols-1 gap-3">
                      {PORTAL_ONBOARDING_PLANS.filter((p) => p.id !== "core").map((p) => {
                        const checked = selectedPlanIds.includes(p.id);
                        const qty = planQuantity(p, planQuantities);
                        const buildFree = couponIsBuild && (p.id === "ai-receptionist" || p.id === "reviews");
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePlan(p.id)}
                            disabled={couponIsBuild && (p.id === "ai-receptionist" || p.id === "reviews")}
                            className={classNames(
                              "flex w-full items-start justify-between gap-4 rounded-2xl border p-4 text-left",
                              checked ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                              couponIsBuild && (p.id === "ai-receptionist" || p.id === "reviews") ? "cursor-not-allowed opacity-70" : "",
                            )}
                          >
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">{p.title}</div>
                              <div className="mt-1 text-sm text-zinc-600">{p.description}</div>
                              {checked && p.quantityConfig ? (
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                                  <div className="font-semibold text-zinc-700">{p.quantityConfig.label}</div>
                                  <input
                                    type="number"
                                    min={p.quantityConfig.min}
                                    max={p.quantityConfig.max}
                                    value={qty}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setSelectionTouched(true);
                                      const n = Number(e.target.value);
                                      setPlanQuantities((prev) => ({ ...prev, [p.id]: n }));
                                    }}
                                    className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                                  />
                                </div>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-zinc-900">{buildFree ? "$0/mo" : moneyLabel(p.monthlyUsd)}</div>
                              {p.oneTimeUsd && !buildFree ? (
                                <div className="mt-1 text-xs font-semibold text-zinc-600">+{formatUsd(p.oneTimeUsd, { maximumFractionDigits: 0 })} setup</div>
                              ) : null}
                              <div
                                className={classNames(
                                  "mt-3 h-4 w-4 rounded border",
                                  checked ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-white",
                                )}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-zinc-900">Due today</div>
                      <div className="text-sm font-semibold text-zinc-900">{formatUsd(dueTodayUsd, { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-zinc-600">Monthly thereafter</div>
                      <div className="text-xs font-semibold text-zinc-700">{formatUsd(monthlyThereafterUsd, { maximumFractionDigits: 0 })}/mo</div>
                    </div>
                    {oneTimeTotalUsd > 0 ? (
                      <div className="mt-1 text-xs text-zinc-500">Includes {formatUsd(oneTimeTotalUsd, { maximumFractionDigits: 0 })} in one-time setup fees.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Create your account</div>
                  <div className="mt-1 text-sm text-zinc-600">You&apos;ll check out next and activate services.</div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-base font-medium">Name</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">Email</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">Phone (optional)</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">Password</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <button
                  className="mt-6 w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? "Continuing…" : "Create account and checkout"}
                </button>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || loading}
              >
                Back
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  onClick={() => setStep((s) => Math.min(3, s + 1))}
                  disabled={!canGoNext || loading}
                >
                  Next
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 text-base text-zinc-600">
            Already have an account?{" "}
            <Link className="font-medium text-brand-ink hover:underline" href="/portal/login">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
