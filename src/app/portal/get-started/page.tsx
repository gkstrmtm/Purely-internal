"use client";

import { Suspense } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { PortalMultiSelectDropdown } from "@/components/PortalMultiSelectDropdown";
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

const STEPS = ["Business", "Goals", "Plan", "Services", "Account"] as const;

type BillingPreference = "credits" | "subscription";
type PackagePreset = "launch-kit" | "sales-loop" | "brand-builder";
type CallsPerMonthRange = "NOT_SURE" | "0_10" | "11_30" | "31_60" | "61_120" | "120_PLUS";

const ACQUISITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Referrals", label: "Referrals" },
  { value: "Google", label: "Google" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "Facebook", label: "Facebook" },
  { value: "Instagram", label: "Instagram" },
  { value: "TikTok", label: "TikTok" },
  { value: "Yelp", label: "Yelp" },
  { value: "Networking", label: "Networking" },
  { value: "Email", label: "Email" },
  { value: "Other", label: "Other" },
];

function normalizePackagePreset(value: string | null): PackagePreset | null {
  const v = String(value || "").trim().toLowerCase();
  if (v === "launch-kit") return "launch-kit";
  if (v === "sales-loop") return "sales-loop";
  if (v === "brand-builder") return "brand-builder";
  return null;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function moneyLabel(monthlyUsd: number) {
  if (!monthlyUsd || monthlyUsd <= 0) return "$0/mo";
  return `${formatUsd(monthlyUsd, { maximumFractionDigits: 0 })}/mo`;
}

function RequiredMark() {
  return <span className="ml-1 align-text-top text-[color:var(--color-brand-pink)]">*</span>;
}

function bundleTitle(id: PackagePreset) {
  if (id === "launch-kit") return "The Launch Kit";
  if (id === "sales-loop") return "The Sales Loop";
  return "The Brand Builder";
}

function bundlePlanIds(id: PackagePreset): string[] {
  switch (id) {
    case "launch-kit":
      return ["core", "automations", "ai-receptionist", "blogs"];
    case "sales-loop":
      return ["core", "booking", "ai-receptionist", "lead-scraping-b2b", "ai-outbound"];
    case "brand-builder":
      return ["core", "blogs", "reviews", "newsletter", "nurture"];
  }
}

export default function PortalGetStartedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-mist text-brand-ink">
          <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
        </div>
      }
    >
      <PortalGetStartedInner />
    </Suspense>
  );
}

function PortalGetStartedInner() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const search = useSearchParams();
  const toast = useToast();

  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";
  // The authenticated app lives under /portal; /credit is a branded entrypoint.
  const appBase = "/portal";
  const logoSrc = portalBase === "/credit" ? "/brand/purely%20credit.png" : "/brand/purity-5.png";

  const checkoutState = (search?.get("checkout") || "").trim().toLowerCase();
  const referralCode = (search?.get("ref") || "").trim();
  useEffect(() => {
    if (checkoutState === "cancel") {
      toast.error("Checkout canceled");
    }
  }, [checkoutState, toast]);

  const [step, setStep] = useState(0);

  const packagePreset = normalizePackagePreset(search?.get("package") || null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasWebsite, setHasWebsite] = useState<"YES" | "NO" | "NOT_SURE">("YES");
  const [callsPerMonthRange, setCallsPerMonthRange] = useState<CallsPerMonthRange>("NOT_SURE");
  const [acquisitionMethods, setAcquisitionMethods] = useState<string[]>([]);
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  const [billingPreference, setBillingPreference] = useState<BillingPreference>(packagePreset ? "subscription" : "credits");
  const [selectedBundleId, setSelectedBundleId] = useState<PackagePreset | null>(packagePreset);

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
    if (!packagePreset) return;
    if (selectionTouched) return;
    setSelectedBundleId(packagePreset);
    setSelectedPlanIds(bundlePlanIds(packagePreset));
    setBillingPreference("subscription");
  }, [packagePreset, selectionTouched]);

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
    setSelectedBundleId(null);
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

  const recommendedBundleId: PackagePreset = (() => {
    const s = new Set(normalizedGoals);

    // If the user explicitly wants brand/content/reviews, lean Brand Builder.
    if (s.has("content") || s.has("reviews")) return "brand-builder";

    // If they care about appointments/leads/outbound or miss calls, lean Sales Loop.
    if (s.has("appointments") || s.has("leads") || s.has("outbound") || s.has("receptionist")) return "sales-loop";
    if (callsPerMonthRange === "31_60" || callsPerMonthRange === "61_120" || callsPerMonthRange === "120_PLUS") return "sales-loop";

    // If they don't have a website yet or are unsure, default to Launch Kit.
    if (hasWebsite === "NO" || s.has("unsure")) return "launch-kit";

    return "sales-loop";
  })();

  const canGoNext = (() => {
    if (step === 0) return businessName.trim().length >= 2 && city.trim().length >= 2 && state.trim().length >= 2;
    if (step === 1) return true;
    if (step === 2) return billingPreference === "credits" || billingPreference === "subscription";
    if (step === 3) return billingPreference === "credits" ? true : selectedPlanIds.includes("core");
    if (step === 4) {
      return name.trim().length >= 2 && email.trim().length >= 3 && password.trim().length >= 8;
    }
    return false;
  })();

  function goNext() {
    if (step === 2 && billingPreference === "credits") {
      setStep(4);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  }

  function goBack() {
    if (step === 4 && billingPreference === "credits") {
      setStep(2);
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let res: Response;
    try {
      res = await fetch("/api/auth/client-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          referralCode,
          businessName,
          city,
          state,
          websiteUrl,
          hasWebsite,
          callsPerMonthRange,
          acquisitionMethods,
          industry,
          businessModel,
          targetCustomer,
          brandVoice,
          goalIds: normalizedGoals,
          selectedServiceSlugs,
          selectedPlanIds,
          selectedPlanQuantities: planQuantities,
          couponCode: normalizedCoupon,
          billingPreference,
          selectedBundleId,
        }),
      });
    } catch {
      setLoading(false);
      setError("Network error while creating your account. Please check your connection and try again.");
      return;
    }

    const requestIdFromHeader = res.headers.get("x-pa-request-id") || "";

    if (!res.ok) {
      const rawText = await res.text().catch(() => "");
      const body = (() => {
        try {
          return rawText ? JSON.parse(rawText) : {};
        } catch {
          return {};
        }
      })();

      const requestId =
        (typeof body?.requestId === "string" ? body.requestId : "") ||
        requestIdFromHeader;

      const serverError = typeof body?.error === "string" ? body.error : "";

      const fallbackBase =
        res.status === 409
          ? "That email already has an account. Try signing in instead."
          : res.status === 400
            ? "Please check the form and try again."
            : res.status === 403
              ? "Signup is currently disabled."
              : res.status >= 500
                ? "Server error while creating your account. Please try again in a minute."
                : "Unable to create account.";

      const msg = serverError || fallbackBase;
      const ref = requestId ? ` (Ref: ${requestId})` : "";

      setLoading(false);
      setError(msg + ref);
      return;
    }

    // Credits-only: skip subscription checkout and go straight into onboarding.
    // Note: the signup route already provisions starter credits for credits billing.
    if (billingPreference === "credits") {
      const starterCredits = 50;
      setLoading(false);
      window.location.assign(`${appBase}/app/onboarding?creditsAdded=${starterCredits}`);
      return;
    }

    const checkoutRes = await fetch("/api/portal/billing/onboarding-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
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
        credentials: "include",
        body: JSON.stringify({ bypass: true }),
      });
      const confirmJson = await confirmRes.json().catch(() => null);
      if (!confirmRes.ok || !confirmJson?.ok) {
        setError(confirmJson?.error || "Unable to activate services");
        router.push(`${portalBase}/login?from=${encodeURIComponent(`${appBase}/app/onboarding`)}`);
        return;
      }

      const bonusCredits = typeof confirmJson?.bonusCredits === "number" ? Math.max(0, Math.trunc(confirmJson.bonusCredits)) : 0;
      const query = bonusCredits > 0 ? `?creditsAdded=${bonusCredits}` : "";
      window.location.assign(`${appBase}/app/onboarding${query}`);
      return;
    }

    if (!checkoutRes.ok || !checkoutJson?.ok || !checkoutJson?.url) {
      const msg = checkoutJson?.error || (checkoutRes.status === 401 ? "Unauthorized" : "Unable to start checkout");
      toast.error(msg);
      setError(msg);
      if (checkoutRes.status === 401 || checkoutRes.status === 403) {
        window.location.assign(`${portalBase}/login?from=${encodeURIComponent(`${appBase}/app/onboarding`)}`);
        return;
      }

      window.location.assign(`${appBase}/app/billing`);
      return;
    }

    window.location.assign(String(checkoutJson.url));
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <Image
              src={logoSrc}
              alt="Purely Automation"
              width={520}
              height={160}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </div>

          <p className="mt-6 text-base text-zinc-600">Set up your portal in a few quick steps.</p>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (i > step) return;
                  if (billingPreference === "credits" && i === 3) return;
                  setStep(i);
                }}
                className={classNames(
                  "min-w-0 w-full rounded-full border px-3 py-2 text-xs font-semibold sm:flex-1",
                  billingPreference === "credits" && i === 3 ? "cursor-not-allowed opacity-50" : "",
                  i === step
                    ? "border-brand-ink bg-brand-ink text-white"
                    : i < step
                      ? "border-zinc-200 bg-zinc-50 text-zinc-700"
                      : "border-zinc-200 bg-white text-zinc-400",
                )}
              >
                <span className="block truncate">{label}</span>
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
                    <label className="text-base font-medium">
                      Business name
                      <RequiredMark />
                    </label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-base font-medium">
                        City
                        <RequiredMark />
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        placeholder="Austin"
                      />
                    </div>

                    <div>
                      <label className="text-base font-medium">
                        State
                        <RequiredMark />
                      </label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        required
                        placeholder="TX"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-base font-medium">
                      Do you already have a website?
                      <RequiredMark />
                    </label>
                    <div className="mt-2">
                      <PortalListboxDropdown
                        value={hasWebsite}
                        onChange={(v) => {
                          setHasWebsite(v);
                          if (v === "NO") setWebsiteUrl("");
                        }}
                        options={
                          [
                            { value: "YES", label: "Yes" },
                            { value: "NO", label: "No" },
                            { value: "NOT_SURE", label: "Not sure" },
                          ] satisfies Array<PortalListboxOption<typeof hasWebsite>>
                        }
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none hover:bg-zinc-50 focus:border-zinc-400"
                      />
                    </div>
                  </div>

                  {hasWebsite === "NO" ? null : (
                    <div>
                      <label className="text-base font-medium">Website</label>
                      <input
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://yourbusiness.com"
                      />
                      <div className="mt-2 text-xs text-zinc-500">If you don’t have one yet, leave this blank.</div>
                    </div>
                  )}

                  <div>
                    <label className="text-base font-medium">About how many calls do you get per month?</label>
                    <div className="mt-2">
                      <PortalListboxDropdown
                        value={callsPerMonthRange}
                        onChange={(v) => setCallsPerMonthRange(v)}
                        options={
                          [
                            { value: "NOT_SURE", label: "Not sure" },
                            { value: "0_10", label: "0–10" },
                            { value: "11_30", label: "11–30" },
                            { value: "31_60", label: "31–60" },
                            { value: "61_120", label: "61–120" },
                            { value: "120_PLUS", label: "120+" },
                          ] satisfies Array<PortalListboxOption<CallsPerMonthRange>>
                        }
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none hover:bg-zinc-50 focus:border-zinc-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-base font-medium">How do people find you?</label>
                    <div className="mt-2">
                      <PortalMultiSelectDropdown
                        label="channels"
                        value={acquisitionMethods}
                        onChange={(next) => setAcquisitionMethods(next)}
                        options={ACQUISITION_OPTIONS}
                        allowCustom
                        placeholder="Type to search…"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-base font-medium">Industry</label>
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
                    <label className="text-base font-medium">Business model</label>
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
                    <label className="text-base font-medium">Target customer</label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={targetCustomer}
                      onChange={(e) => setTargetCustomer(e.target.value)}
                      placeholder="Who do you primarily serve?"
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">Brand voice</label>
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
                <div className="text-sm font-semibold text-zinc-900">Pick your plan</div>
                <div className="mt-1 text-sm text-zinc-600">Choose how you’d like to start. You can change this later.</div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setBillingPreference("credits");
                      setSelectedBundleId(null);
                    }}
                    className={classNames(
                      "rounded-2xl border p-4 text-left",
                      billingPreference === "credits" ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                    )}
                  >
                    <div className="text-sm font-semibold text-zinc-900">Start for free</div>
                    <div className="mt-1 text-sm text-zinc-600">Only pay for what you use (usage-based credits).</div>
                    <div className="mt-2 text-xs font-semibold text-zinc-700">Best if you want to try it first.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBillingPreference("subscription")}
                    className={classNames(
                      "rounded-2xl border p-4 text-left",
                      billingPreference === "subscription" ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                    )}
                  >
                    <div className="text-sm font-semibold text-zinc-900">Monthly membership</div>
                    <div className="mt-1 text-sm text-zinc-600">Best value if you’re ready to grow.</div>
                    <div className="mt-2 text-xs font-semibold text-zinc-700">Includes free credits every month.</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-700">You’ll pick services next.</div>
                  </button>
                </div>

                {billingPreference === "subscription" ? (
                  <div className="mt-6">
                    <div className="text-sm font-semibold text-zinc-900">Recommended package</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      {packagePreset ? (
                        <>
                          You chose <span className="font-semibold text-zinc-900">{bundleTitle(packagePreset)}</span>. Based on your answers, we recommend{" "}
                          <span className="font-semibold text-zinc-900">{bundleTitle(recommendedBundleId)}</span>.
                        </>
                      ) : (
                        <>
                          Based on your answers, we recommend <span className="font-semibold text-zinc-900">{bundleTitle(recommendedBundleId)}</span>.
                        </>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3">
                      {(["launch-kit", "sales-loop", "brand-builder"] as const).map((id) => {
                        const checked = selectedBundleId === id;
                        const isRecommended = recommendedBundleId === id;
                        const isChosen = packagePreset === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setBillingPreference("subscription");
                              setSelectionTouched(true);
                              setSelectedBundleId(id);
                              setSelectedPlanIds(bundlePlanIds(id));
                            }}
                            className={classNames(
                              "rounded-2xl border p-4 text-left",
                              checked ? "border-brand-ink bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                            )}
                          >
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-zinc-900">{bundleTitle(id)}</div>
                              <div className="flex items-center gap-2">
                                {isChosen ? (
                                  <span className="rounded-full bg-[color:var(--color-brand-pink)] px-2 py-1 text-xs font-semibold text-white">You chose</span>
                                ) : null}
                                {isRecommended ? (
                                  <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">Recommended</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-2 break-words text-sm text-zinc-600">Includes: {bundlePlanIds(id).map((pid) => planById(pid)?.title || pid).join(", ")}</div>
                            {checked ? <div className="mt-2 text-xs font-semibold text-zinc-700">Selected</div> : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-xs text-zinc-500">You can fine-tune services on the next step.</div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900">We’ll start you with a recommended setup</div>
                    <div className="mt-1 text-sm text-zinc-600">You can change your services anytime inside your portal.</div>
                  </div>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              billingPreference === "subscription" ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Services</div>
                  <div className="mt-1 text-sm text-zinc-600">We recommend a starting set. You can change this anytime.</div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Coupon code</div>
                          <div className="mt-1 text-xs text-zinc-500">You can also enter a promo code at checkout.</div>
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
                        <div className="mt-2 text-xs font-semibold text-emerald-700">BUILD applied; free bundle enabled (Core + AI Receptionist + Reviews).</div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex min-w-0 items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900">Core Portal</div>
                          <div className="mt-1 break-words text-sm text-zinc-600">Includes Inbox/Outbox, Media Library, Tasks, and Reporting.</div>
                        </div>
                        <div className="shrink-0 text-right">
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
                              "flex w-full min-w-0 items-start justify-between gap-4 rounded-2xl border p-4 text-left",
                              checked ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                              couponIsBuild && (id === "ai-receptionist" || id === "reviews") ? "cursor-not-allowed opacity-70" : "",
                            )}
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-900">{p.title}</div>
                              <div className="mt-1 break-words text-sm text-zinc-600">{p.description}</div>
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
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold text-zinc-900">{buildFree ? "$0/mo" : moneyLabel(p.monthlyUsd)}</div>
                              {p.oneTimeUsd && !buildFree ? (
                                <div className="mt-1 text-xs font-semibold text-zinc-600">+{formatUsd(p.oneTimeUsd, { maximumFractionDigits: 0 })} setup</div>
                              ) : null}
                              <div className={classNames("mt-3 h-4 w-4 rounded border", checked ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-white")} />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className={classNames(
                        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                        showAllServices
                          ? "border-zinc-200 bg-white text-brand-ink hover:bg-zinc-50"
                          : "border-[color:var(--color-brand-blue)] bg-[color:var(--color-brand-blue)] text-white hover:opacity-95",
                      )}
                      onClick={() => setShowAllServices((v) => !v)}
                    >
                      <span>{showAllServices ? "Hide all services" : "See all services"}</span>
                      <span className={showAllServices ? "text-zinc-500" : "text-white/90"}>{showAllServices ? "▴" : "▾"}</span>
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
                                "flex w-full min-w-0 items-start justify-between gap-4 rounded-2xl border p-4 text-left",
                                checked ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                                couponIsBuild && (p.id === "ai-receptionist" || p.id === "reviews") ? "cursor-not-allowed opacity-70" : "",
                              )}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-zinc-900">{p.title}</div>
                                <div className="mt-1 break-words text-sm text-zinc-600">{p.description}</div>
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
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-semibold text-zinc-900">{buildFree ? "$0/mo" : moneyLabel(p.monthlyUsd)}</div>
                                {p.oneTimeUsd && !buildFree ? (
                                  <div className="mt-1 text-xs font-semibold text-zinc-600">+{formatUsd(p.oneTimeUsd, { maximumFractionDigits: 0 })} setup</div>
                                ) : null}
                                <div className={classNames("mt-3 h-4 w-4 rounded border", checked ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-white")} />
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
              ) : (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">No monthly services needed</div>
                  <div className="mt-1 text-sm text-zinc-600">You’re starting free. You can pick services anytime inside your portal.</div>
                </div>
              )
            ) : null}

            {step === 4 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Create your account</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {billingPreference === "subscription" ? "You’ll check out next and activate services." : "You’ll start free and activate services."}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-base font-medium">
                      Name
                      <RequiredMark />
                    </label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">
                      Email
                      <RequiredMark />
                    </label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">
                      Phone
                      <RequiredMark />
                    </label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-base font-medium">
                      Password
                      <RequiredMark />
                    </label>
                    <input
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <div className="mt-2 text-xs text-zinc-500">Minimum 8 characters.</div>
                  </div>
                </div>

                <button
                  className="mt-6 w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  {loading
                    ? "Continuing…"
                    : billingPreference === "subscription"
                      ? "Create account and checkout"
                      : "Create account and start free"}
                </button>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                onClick={goBack}
                disabled={step === 0 || loading}
              >
                Back
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  onClick={goNext}
                  disabled={!canGoNext || loading}
                >
                  Next
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 text-base text-zinc-600">
            Already have an account?{" "}
            <a
              className="font-medium text-brand-ink hover:underline"
              href={`${portalBase}/login?from=${encodeURIComponent(`${appBase}/app/onboarding`)}`}
              onClick={(e) => {
                e.preventDefault();
                window.location.assign(`${portalBase}/login?from=${encodeURIComponent(`${appBase}/app/onboarding`)}`);
              }}
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
