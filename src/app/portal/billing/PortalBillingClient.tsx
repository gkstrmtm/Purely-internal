"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ToastProvider";
import { formatUsd } from "@/lib/pricing.shared";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

type BillingStatus = { configured: boolean };

type BillingSummary =
  | { ok: true; configured: false }
  | {
      ok: true;
      configured: true;
      monthlyCents: number;
      currency: string;
      monthlyBreakdown?: Array<{ subscriptionId: string; title: string; monthlyCents: number; currency: string }>;
      spentThisMonthCents?: number;
      spentThisMonthCurrency?: string;
      subscription?: {
        id: string;
        status: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd: number | null;
      };
    }
  | { ok: false; configured: boolean; error?: string; details?: string };

type SubscriptionRow = {
  id: string;
  title: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  currency: string;
  items: Array<{ quantity: number; priceId: string; unitAmount: number | null; interval: string | null }>;
};

type SubscriptionsResponse =
  | { ok: true; configured: boolean; subscriptions: SubscriptionRow[] }
  | { ok: false; error?: string };

type ServicesStatusResponse =
  | {
      ok: true;
      ownerId: string;
      billingModel?: "subscription" | "credits";
      entitlements: Record<string, boolean>;
      statuses: Record<
        string,
        { state: "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled"; label: string }
      >;
    }
  | { ok: false; error?: string };

type PortalPricing =
  | {
      ok: true;
      stripeConfigured: boolean;
      modules: {
        blog: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        booking: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        automations: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        reviews: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        newsletter: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        nurture: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        aiReceptionist: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        leadScraping: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        crm: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
        leadOutbound: { monthlyCents: number; setupCents?: number; currency: string; usageBased?: boolean; title?: string } | null;
      };
    }
  | { ok: false; error?: string };

function formatMoney(cents: number, currency: string) {
  const value = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const curr = (currency || "usd").toUpperCase();
  const amount = (value / 100).toFixed(2);
  return `${curr} ${amount}`;
}

export function PortalBillingClient() {
  const router = useRouter();
  const toast = useToast();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/portal/app/billing";
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [pricing, setPricing] = useState<PortalPricing | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditUsdValue, setCreditUsdValue] = useState<number | null>(null);
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [purchaseAvailable, setPurchaseAvailable] = useState(false);
  const [creditsToBuy, setCreditsToBuy] = useState(500);
  const [services, setServices] = useState<ServicesStatusResponse | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const billingModel = services && "ok" in services && services.ok ? services.billingModel : undefined;
  const creditsOnly = billingModel === "credits";

  const [adModalOpen, setAdModalOpen] = useState(false);
  const [adWatchedSeconds, setAdWatchedSeconds] = useState(0);
  const [adMediaReady, setAdMediaReady] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);
  const [adConfirmExit, setAdConfirmExit] = useState(false);
  const [adAutoClaimed, setAdAutoClaimed] = useState(false);
  const adVideoRef = useRef<HTMLVideoElement | null>(null);

  const [rewardCampaign, setRewardCampaign] = useState<null | {
    id: string;
    name: string;
    placement: "FULLSCREEN_REWARD" | "SIDEBAR_BANNER" | "BILLING_SPONSORED";
    creative?: {
      headline?: string;
      body?: string;
      ctaText?: string;
      linkUrl?: string;
      mediaUrl?: string;
      mediaKind?: "image" | "video";
      mediaFit?: "cover" | "contain";
      mediaPosition?: string;
      fullscreenMediaMaxWidthPct?: number;
    };
    reward?: { credits?: number; cooldownHours?: number; minWatchSeconds?: number } | null;
  }>(null);

  const [rewardStatus, setRewardStatus] = useState<null | { eligible: boolean; nextEligibleAtIso: string | null }>(null);

  const adMinWatchSeconds = Math.max(0, Math.floor(Number(rewardCampaign?.reward?.minWatchSeconds ?? 15)));
  const adRewardCredits = Math.max(0, Math.floor(Number(rewardCampaign?.reward?.credits ?? 0)));

  const adEligible = rewardStatus?.eligible ?? true;

  const adRemainingSeconds = Math.max(0, (adMinWatchSeconds || 0) - Math.floor(adWatchedSeconds || 0));

  const [purchaseModal, setPurchaseModal] = useState<null | {
    module: "blog" | "booking" | "automations" | "reviews" | "newsletter" | "nurture" | "aiReceptionist" | "leadScraping" | "crm" | "leadOutbound";
    serviceTitle: string;
  }>(null);


  const [serviceMenuSlug, setServiceMenuSlug] = useState<string | null>(null);

  const [cancelModal, setCancelModal] = useState<null | {
    step: 1 | 2;
    subscriptionId: string;
    title: string;
    immediate: boolean;
    typed: string;
    ack: boolean;
  }>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const refreshCredits = useCallback(async () => {
    const res = await fetch("/api/portal/credits", { cache: "no-store" });
    if (!res.ok) return;
    const c = (await res.json().catch(() => ({}))) as {
      credits?: number;
      autoTopUp?: boolean;
      purchaseAvailable?: boolean;
    };
    setCredits(typeof c.credits === "number" && Number.isFinite(c.credits) ? c.credits : 0);
    setAutoTopUp(Boolean(c.autoTopUp));
    setPurchaseAvailable(Boolean(c.purchaseAvailable));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [billingRes, summaryRes, creditsRes, servicesRes, subsRes, pricingRes] = await Promise.all([
        fetch("/api/billing/status", { cache: "no-store" }),
        fetch("/api/portal/billing/summary", { cache: "no-store" }),
        fetch("/api/portal/credits", { cache: "no-store" }),
        fetch("/api/portal/services/status", { cache: "no-store" }),
        fetch("/api/portal/billing/subscriptions", { cache: "no-store" }),
        fetch("/api/portal/pricing", { cache: "no-store" }).catch(() => null as any),
      ]);
      if (!mounted) return;
      if (!billingRes.ok) {
        const body = await billingRes.json().catch(() => ({}));
        setError(body?.error ?? "Unable to load billing");
        setLoading(false);
        return;
      }

      setStatus((await billingRes.json()) as BillingStatus);

      if (summaryRes.ok) {
        setSummary((await summaryRes.json().catch(() => null)) as BillingSummary | null);
      } else {
        setSummary(null);
      }

      if (creditsRes.ok) {
        const c = (await creditsRes.json().catch(() => ({}))) as {
          credits?: number;
          autoTopUp?: boolean;
          purchaseAvailable?: boolean;
          creditUsdValue?: number;
        };
        setCredits(typeof c.credits === "number" && Number.isFinite(c.credits) ? c.credits : 0);
        setAutoTopUp(Boolean(c.autoTopUp));
        setPurchaseAvailable(Boolean(c.purchaseAvailable));
        setCreditUsdValue(typeof c.creditUsdValue === "number" && Number.isFinite(c.creditUsdValue) ? c.creditUsdValue : null);
      } else {
        setCredits(0);
        setAutoTopUp(false);
        setPurchaseAvailable(false);
        setCreditUsdValue(null);
      }

      if (servicesRes.ok) {
        setServices((await servicesRes.json().catch(() => null)) as ServicesStatusResponse | null);
      } else {
        setServices(null);
      }

      if (subsRes.ok) {
        setSubscriptions((await subsRes.json().catch(() => null)) as SubscriptionsResponse | null);
      } else {
        setSubscriptions(null);
      }

      if (pricingRes && pricingRes.ok) {
        setPricing((await pricingRes.json().catch(() => null)) as PortalPricing | null);
      } else {
        setPricing(null);
      }

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const topup = (qs.get("topup") || "").trim();
      const sessionId = (qs.get("session_id") || "").trim();
      if (topup !== "success" || !sessionId) return;

      let cancelled = false;
      (async () => {
        const res = await fetch("/api/portal/credits/topup/confirm-checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && body?.ok) {
          toast.success("Credits added.");
          await refreshCredits();
        }

        const url = new URL(window.location.href);
        url.searchParams.delete("topup");
        url.searchParams.delete("session_id");
        window.history.replaceState(null, "", url.toString());
      })();

      return () => {
        cancelled = true;
      };
    } catch {
      // ignore
    }
  }, [toast, refreshCredits]);

  useEffect(() => {
    if (loading || creditsOnly) {
      if (!loading && creditsOnly) {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has("buy")) {
            url.searchParams.delete("buy");
            url.searchParams.delete("autostart");
            window.history.replaceState(null, "", url.toString());
          }
        } catch {
          // ignore
        }
      }
      return;
    }

    try {
      const qs = new URLSearchParams(window.location.search);
      const buyRaw = (qs.get("buy") || "").trim();
      if (!buyRaw) return;
      if (!(["blog", "booking", "crm", "leadOutbound", "leadScraping"] as const).includes(buyRaw as any)) return;

      const mod = buyRaw as "blog" | "booking" | "crm" | "leadOutbound" | "leadScraping";
      setPurchaseModal({ module: mod, serviceTitle: "Service" });

      const url = new URL(window.location.href);
      url.searchParams.delete("buy");
      url.searchParams.delete("autostart");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }, [loading, creditsOnly]);

  useEffect(() => {
    if (!serviceMenuSlug) return;
    const onDown = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null) ?? null;
      const ref = (document.querySelector(`[data-service-menu-root="${serviceMenuSlug}"]`) as HTMLElement | null);
      if (!ref) {
        setServiceMenuSlug(null);
        return;
      }
      if (el && ref.contains(el)) return;
      setServiceMenuSlug(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setServiceMenuSlug(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [serviceMenuSlug]);

  useEffect(() => {
    if (!adModalOpen) return;
    setAdWatchedSeconds(0);
    setAdMediaReady(false);
    setAdPlaying(false);
    setAdConfirmExit(false);
    setAdAutoClaimed(false);
  }, [adModalOpen, rewardCampaign?.id]);

  useEffect(() => {
    if (!adModalOpen) return;
    if (!adMediaReady) return;
    if (!adPlaying) return;

    let raf = 0;
    let last = performance.now();

    const tick = () => {
      const video = adVideoRef.current;
      const isReallyPlaying = Boolean(video && !video.paused && !video.ended && video.readyState >= 2);
      const now = performance.now();
      const dt = Math.max(0, now - last);
      last = now;

      if (isReallyPlaying) {
        setAdWatchedSeconds((s) => Math.min(600, s + dt / 1000));
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [adMediaReady, adModalOpen, adPlaying]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const path = window.location.pathname;
      const res = await fetch(
        `/api/portal/ads/next?placement=FULLSCREEN_REWARD&path=${encodeURIComponent(path)}`,
        { cache: "no-store" },
      ).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!alive) return;
      if (!res?.ok || !json?.ok) {
        setRewardCampaign(null);
        setRewardStatus(null);
        return;
      }
      setRewardCampaign(json.campaign ?? null);
      setRewardStatus(
        json?.rewardStatus && typeof json.rewardStatus === "object"
          ? {
              eligible: Boolean(json.rewardStatus.eligible),
              nextEligibleAtIso:
                typeof json.rewardStatus.nextEligibleAtIso === "string" && json.rewardStatus.nextEligibleAtIso
                  ? json.rewardStatus.nextEligibleAtIso
                  : null,
            }
          : null,
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const claimAdReward = useCallback(
    async (opts: { watchedSeconds: number; closeModalOnSuccess?: boolean }) => {
    setError(null);
    setActionBusy("adReward");
    try {
      const campaignId = rewardCampaign?.id ?? "";
      if (!campaignId) {
        setError("No reward campaign available right now.");
        return { ok: false as const };
      }
      if (!adEligible) {
        setError("Not available right now.");
        return { ok: false as const };
      }
      const path = window.location.pathname;
      const watchedSeconds = Math.max(0, Math.floor(opts.watchedSeconds));
      const res = await fetch("/api/portal/ads/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId, watchedSeconds, path }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Unable to claim reward");
        if (res.status === 429 && typeof body?.nextAtIso === "string" && body.nextAtIso) {
          setRewardStatus({ eligible: false, nextEligibleAtIso: body.nextAtIso });
        }
        return { ok: false as const };
      }
      if (body?.ok) {
        toast.success("Credits added.");
        await refreshCredits();
        setRewardStatus(typeof body?.nextAtIso === "string" && body.nextAtIso ? { eligible: false, nextEligibleAtIso: body.nextAtIso } : null);
        if (opts?.closeModalOnSuccess) {
          setAdModalOpen(false);
        }
        return { ok: true as const };
      }
      return { ok: false as const };
    } finally {
      setActionBusy(null);
    }
    },
    [adEligible, refreshCredits, rewardCampaign?.id, toast],
  );

  useEffect(() => {
    if (!adModalOpen) return;
    if (adAutoClaimed) return;
    if (!rewardCampaign?.id) return;
    if (!adEligible) return;
    if (adRewardCredits <= 0) return;
    const minWatch = adMinWatchSeconds || 0;
    if (minWatch <= 0) return;
    if (Math.floor(adWatchedSeconds || 0) < minWatch) return;

    setAdAutoClaimed(true);
    void claimAdReward({ watchedSeconds: Math.floor(adWatchedSeconds || 0), closeModalOnSuccess: true });
  }, [adAutoClaimed, adEligible, adMinWatchSeconds, adModalOpen, adRewardCredits, adWatchedSeconds, rewardCampaign?.id, claimAdReward]);

  function openPurchaseModal(
    module: "blog" | "booking" | "automations" | "reviews" | "newsletter" | "nurture" | "aiReceptionist" | "leadScraping" | "crm" | "leadOutbound",
    serviceTitle: string,
  ) {
    if (creditsOnly) return;
    setServiceMenuSlug(null);
    setPurchaseModal({ module, serviceTitle });
  }

  async function purchaseModule(
    module: "blog" | "booking" | "automations" | "reviews" | "newsletter" | "nurture" | "aiReceptionist" | "leadScraping" | "crm" | "leadOutbound",
  ) {
    if (creditsOnly) {
      setError("This portal uses credits-only billing. Subscriptions are disabled.");
      return;
    }
    setError(null);
    setActionBusy(`module:${module}`);
    const res = await fetch("/api/portal/billing/checkout-module", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        module,
        successPath: "/portal/app/billing?checkout=success",
        cancelPath: "/portal/app/billing?checkout=cancel",
      }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok) {
      setError(body?.error ?? "Unable to start checkout");
      return;
    }
    if (body?.url && typeof body.url === "string") {
      window.location.href = body.url;
      return;
    }
    setError("Unable to start checkout");
  }

  function modulePurchasable(
    module: "blog" | "booking" | "automations" | "reviews" | "newsletter" | "nurture" | "aiReceptionist" | "leadScraping" | "crm" | "leadOutbound",
  ) {
    if (!pricing || !("ok" in pricing) || pricing.ok !== true) return false;
    const mod = (pricing.modules as any)?.[module] ?? null;
    return Boolean(mod && typeof mod.monthlyCents === "number" && mod.monthlyCents > 0);
  }


  async function manage() {
    setError(null);
    setActionBusy("manage");
    const res = await fetch("/api/portal/billing/create-portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnPath: "/portal/app/billing" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Unable to open billing portal");
      setActionBusy(null);
      return;
    }
    const json = (await res.json()) as { url: string };
    window.location.href = json.url;
  }

  async function refreshSummary() {
    const res = await fetch("/api/portal/billing/summary", { cache: "no-store" });
    if (!res.ok) {
      setSummary(null);
      return;
    }
    setSummary((await res.json().catch(() => null)) as BillingSummary | null);
  }

  async function refreshSubscriptions() {
    const res = await fetch("/api/portal/billing/subscriptions", { cache: "no-store" });
    if (!res.ok) {
      setSubscriptions(null);
      return;
    }
    setSubscriptions((await res.json().catch(() => null)) as SubscriptionsResponse | null);
  }

  async function refreshServices() {
    const res = await fetch("/api/portal/services/status", { cache: "no-store" });
    if (!res.ok) {
      setServices(null);
      return;
    }
    setServices((await res.json().catch(() => null)) as ServicesStatusResponse | null);
  }

  async function setServiceLifecycle(serviceSlug: string, action: "pause" | "cancel" | "resume") {
    setError(null);
    setServiceMenuSlug(null);
    setActionBusy(`service:${serviceSlug}:${action}`);
    const res = await fetch("/api/portal/services/lifecycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceSlug, action }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok || !body?.ok) {
      setError(body?.error ?? "Unable to update service");
      return;
    }
    toast.success("Updated.");
    await Promise.all([refreshServices(), refreshSummary(), refreshSubscriptions()]);
  }

  async function saveAutoTopUp(next: boolean) {
    setError(null);
    setActionBusy("auto-topup");
    const res = await fetch("/api/portal/credits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoTopUp: next }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok) {
      setError(body?.error ?? "Unable to update auto top-up");
      return;
    }
    setAutoTopUp(Boolean(body?.autoTopUp));
    setCredits(typeof body?.credits === "number" ? body.credits : credits);
  }

  async function topUp() {
    setError(null);
    setActionBusy("topup");
    const requested = Math.max(1, Math.floor(Number(creditsToBuy) || 0));
    const res = await fetch("/api/portal/credits/topup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credits: requested }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);

    if (!res.ok) {
      setError(body?.error ?? "Unable to purchase credits");
      return;
    }

    if (body?.url && typeof body.url === "string") {
      window.location.href = body.url;
      return;
    }

    // Dev/test fallback credits add.
    await refreshCredits();
  }

  async function cancelOneSubscription(subscriptionId: string, immediate: boolean) {
    setError(null);
    setActionBusy(immediate ? `cancel-now:${subscriptionId}` : `cancel:${subscriptionId}`);
    const res = await fetch("/api/portal/billing/cancel-subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptionId, immediate }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error ?? "Unable to cancel subscription");
      setActionBusy(null);
      return;
    }

    await Promise.all([refreshSummary(), refreshSubscriptions()]);
    setActionBusy(null);
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
        Something went wrong loading billing. Please refresh.
      </div>
    );
  }

  const summaryCurrency =
    summary && summary.configured && "currency" in summary && typeof (summary as any).currency === "string"
      ? String((summary as any).currency || "").trim() || "usd"
      : "usd";

  const spentThisMonthText =
    summary && summary.configured && "spentThisMonthCents" in summary && typeof summary.spentThisMonthCents === "number"
      ? formatMoney(summary.spentThisMonthCents, (summary as any).spentThisMonthCurrency || summaryCurrency)
      : "N/A";

  const serviceStatuses = services && "ok" in services && services.ok ? services.statuses : null;

  const modulePrices = pricing && "ok" in pricing && pricing.ok === true ? pricing.modules : null;
  const internalMonthlyBreakdown: Array<{ subscriptionId: string; title: string; monthlyCents: number; currency: string }> = [];
  if (modulePrices && serviceStatuses && !creditsOnly) {
    const activeModules = new Set<string>();
    for (const s of PORTAL_SERVICES) {
      if (!s.entitlementKey) continue;
      const st = serviceStatuses?.[s.slug];
      if (!st || st.state !== "active") continue;
      activeModules.add(s.entitlementKey);
    }

    for (const key of Array.from(activeModules)) {
      const p = (modulePrices as any)[key] as { monthlyCents: number; currency: string } | null;
      if (!p || typeof p.monthlyCents !== "number" || p.monthlyCents <= 0) continue;
      const title =
        key === "blog"
          ? "Automated Blogs"
          : key === "booking"
            ? "Booking Automation"
            : key === "crm"
              ? "CRM / Follow-up"
              : key === "leadOutbound"
                ? "AI Outbound Calls"
                : String(key);
      internalMonthlyBreakdown.push({
        subscriptionId: `internal:${key}`,
        title,
        monthlyCents: p.monthlyCents,
        currency: p.currency || summaryCurrency,
      });
    }
  }

  const internalMonthlyCents = internalMonthlyBreakdown.reduce((sum, x) => sum + (x.monthlyCents || 0), 0);
  const stripeMonthlyCents =
    summary && summary.configured && "monthlyCents" in summary && typeof summary.monthlyCents === "number" ? summary.monthlyCents : 0;
  const displayMonthlyCents = Math.max(0, Math.max(stripeMonthlyCents, internalMonthlyCents));
  const displayCurrency =
    (summary && summary.configured && "currency" in summary && typeof (summary as any).currency === "string"
      ? String((summary as any).currency || "").trim().toLowerCase()
      : "") ||
    (internalMonthlyBreakdown[0]?.currency || summaryCurrency || "usd");

  const monthlyText = creditsOnly ? "No subscription" : status?.configured ? formatMoney(displayMonthlyCents, displayCurrency) : "N/A";

  const sub = summary && "ok" in summary && summary.ok === true && summary.configured ? summary.subscription : undefined;
  const hasActiveSub = creditsOnly ? false : Boolean(sub?.id && ["active", "trialing", "past_due"].includes(String(sub.status)));

  const monthlyNote = creditsOnly
    ? "You’re on a credits-only plan. There is no monthly subscription."
    : !status?.configured
      ? "Billing isn’t configured on this environment yet."
      : summary && "ok" in summary && summary.ok === false
        ? summary.error ?? "Unable to load summary"
        : Boolean(sub?.id && ["active", "trialing", "past_due"].includes(String(sub.status)))
          ? "Your subscription is active."
          : internalMonthlyCents > 0
            ? "Based on active services in the portal."
            : "No active subscription.";
  const periodEndText =
    sub?.currentPeriodEnd && typeof sub.currentPeriodEnd === "number"
      ? new Date(sub.currentPeriodEnd * 1000).toLocaleDateString()
      : null;

  const creditsRequested = Math.max(1, Math.floor(Number(creditsToBuy) || 0));
  const creditsTotalUsd = creditsRequested * (typeof creditUsdValue === "number" ? creditUsdValue : 0);

  const badgeClass = (state: string) => {
    if (state === "active") return "bg-emerald-100 text-emerald-900";
    if (state === "paused") return "bg-red-100 text-red-900";
    if (state === "canceled") return "bg-red-100 text-red-900";
    if (state === "needs_setup") return "bg-amber-100 text-amber-900";
    if (state === "locked") return "bg-zinc-100 text-zinc-700";
    return "bg-zinc-100 text-zinc-700";
  };

  const setupHrefForService = (slug: string, label?: string | null) => {
    const l = String(label || "").toLowerCase();
    if (slug === "booking") return "/portal/app/services/booking/settings";
    if (slug === "tasks") return "/portal/app/tasks";
    if (slug === "automations") return "/portal/app/services/automations";
    if (slug === "blogs") return "/portal/app/services/blogs";
    if (slug === "reviews") return "/portal/app/services/reviews/setup";
    if (slug === "ai-receptionist") return "/portal/app/services/ai-receptionist";
    if (slug === "ai-outbound-calls") {
      if (l.includes("twilio")) return "/portal/app/profile";
      return "/portal/app/services/ai-outbound-calls";
    }
    if (slug === "newsletter") return "/portal/app/services/newsletter";
    if (slug === "nurture-campaigns") return "/portal/app/services/nurture-campaigns";
    if (slug === "lead-scraping") return "/portal/app/services/lead-scraping/settings";
    return `/portal/app/services/${encodeURIComponent(slug)}`;
  };

  const setupActionLabelForService = (slug: string, label?: string | null) => {
    const l = String(label || "").toLowerCase();
    if (slug === "ai-outbound-calls" && l.includes("twilio")) return "Connect Twilio";
    if (slug === "lead-scraping") return "Open settings";
    if (slug === "blogs") return "Open settings";
    if (slug === "booking") return "Open settings";
    if (slug === "reviews") return "Open settings";
    if (slug === "ai-receptionist") return "Open settings";
    return "Open";
  };

  const accessBreakdownRows = (() => {
    if (!serviceStatuses) return [] as Array<{
      slug: string;
      title: string;
      state: string;
      label: string;
      currency: string;
      monthlyCents: number;
      included: boolean;
    }>;

    const rows = PORTAL_SERVICES.filter((s) => !s.hidden && (!s.variants || s.variants.includes("portal")))
      .map((s) => {
        const st = serviceStatuses?.[s.slug];
        const state = st?.state ?? "active";
        const label = st?.label ?? "Ready";

        if (state === "locked" || state === "coming_soon") return null;

        // Follow-up is bundled with Booking (access without additional monthly charge).
        const billingKey = s.slug === "follow-up" ? null : (s.entitlementKey ?? null);
        const p = billingKey && modulePrices ? (modulePrices as any)[billingKey] : null;

        const monthlyCents = creditsOnly
          ? 0
          : typeof p?.monthlyCents === "number" && Number.isFinite(p.monthlyCents)
            ? p.monthlyCents
            : 0;
        const currency = String(p?.currency || summaryCurrency || "usd");

        const included = Boolean(s.included) || billingKey === null;
        return { slug: s.slug, title: s.title, state, label, currency, monthlyCents, included };
      })
      .filter(Boolean) as Array<{
      slug: string;
      title: string;
      state: string;
      label: string;
      currency: string;
      monthlyCents: number;
      included: boolean;
    }>;

    rows.sort((a, b) => {
      if (a.included !== b.included) return a.included ? 1 : -1;
      return a.title.localeCompare(b.title);
    });

    return rows;
  })();

  const statusDotClass = hasActiveSub ? "bg-emerald-500" : "bg-zinc-300";

  const creditPresets = [500, 1000, 2500, 5000];

  const activeSubs = subscriptions && "ok" in subscriptions && subscriptions.ok ? subscriptions.subscriptions : [];

  const cancelBenefits = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes("blogs")) return ["4 posts/month included", "Publishing workflow + scheduling", "Draft generation"]; 
    if (t.includes("booking")) return ["Calendar confirmations + reminders", "Post-booking follow-ups", "No-show reduction"]; 
    if (t.includes("follow-up") || t.includes("crm")) return ["Follow-up sequences", "Lead pipeline tools", "Automation actions tied to CRM"]; 
    if (t.includes("outbound")) return ["AI outbound call campaigns", "Usage-based calling via credits", "Campaign tooling + logging"]; 
    if (t.includes("nurture")) return ["Nurture sequences keep running", "Multi-step SMS/email sends", "Audience-by-tags enrollments"]; 
    return ["Ongoing access to this service", "Automations/workflows tied to it", "Reporting and activity for this service"]; 
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {purchaseModal && !creditsOnly ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Enable service</div>
                <div className="mt-1 text-xl font-bold text-brand-ink">
                  {purchaseModal.serviceTitle !== "Service" ? purchaseModal.serviceTitle : (pricing && (pricing as any).ok ? ((pricing as any).modules?.[purchaseModal.module]?.title || "Service") : "Service")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPurchaseModal(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {(() => {
              const mod = purchaseModal.module;
              const modPricing = pricing && "ok" in pricing && pricing.ok === true ? (pricing.modules as any)[mod] : null;
              const monthlyCents = modPricing?.monthlyCents ?? null;
              const setupCents = modPricing?.setupCents ?? 0;
              const currency = String(modPricing?.currency ?? "usd");
              const usageBased = Boolean(modPricing?.usageBased);

              return (
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-xs font-semibold text-zinc-500">Monthly</div>
                    <div className="mt-1 text-lg font-bold text-brand-ink">
                      {typeof monthlyCents === "number" ? formatMoney(monthlyCents, currency) : "N/A"}
                      <span className="text-sm font-semibold text-zinc-500">/mo</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-xs font-semibold text-zinc-500">Setup fee</div>
                    <div className="mt-1 text-lg font-bold text-brand-ink">
                      {setupCents ? formatMoney(setupCents, currency) : "USD 0.00"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-xs font-semibold text-zinc-500">Usage-based</div>
                    <div className="mt-1 text-lg font-bold text-brand-ink">{usageBased ? "Yes" : "No"}</div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-5 text-sm text-zinc-600">
              You’ll be taken to a secure Stripe checkout. After payment, this service unlocks automatically.
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPurchaseModal(null)}
                className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={async () => {
                  const mod = purchaseModal.module;
                  await purchaseModule(mod);
                }}
                className="rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {actionBusy?.startsWith("module:") ? "Opening…" : "Buy & enable"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Billing</div>
            <div className="mt-1 text-sm text-zinc-600">
              {creditsOnly
                ? "Top up credits, update your payment method, and view invoices."
                : "Update payment method, view invoices, and manage your subscription."}
            </div>
            {creditsOnly ? (
              <div className="mt-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                Credits-only billing
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              onClick={manage}
              disabled={!status?.configured || actionBusy === "manage"}
            >
              {actionBusy === "manage" ? "Opening…" : creditsOnly ? "Payment & invoices" : "Manage billing"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Monthly payment</div>
            <div className="mt-1 text-lg font-bold text-brand-ink">{monthlyText}</div>
            <div className="mt-1 text-xs text-zinc-500">{monthlyNote}</div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Spent this month</div>
            <div className="mt-1 text-lg font-bold text-brand-ink">{spentThisMonthText}</div>
            <div className="mt-1 text-xs text-zinc-500">Paid invoices + one-time charges (credits, installs, etc.)</div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Monthly breakdown</div>
              <div className="mt-1 text-sm text-zinc-600">Everything you currently have access to (billed or included).</div>
            </div>
            {!creditsOnly ? (
              <div className="text-right">
                <div className="text-xs text-zinc-500">Subscription status</div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass}`} />
                  <div className="text-sm font-semibold text-brand-ink">{hasActiveSub ? "Active" : "Not active"}</div>
                  {sub?.cancelAtPeriodEnd ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      Canceling
                    </span>
                  ) : null}
                </div>
                {periodEndText ? <div className="mt-1 text-xs text-zinc-500">Renews/ends: {periodEndText}</div> : null}
              </div>
            ) : null}
          </div>

          {accessBreakdownRows.length ? (
            <div className="mt-3 max-h-[260px] overflow-auto pr-1 sm:max-h-[320px]">
              <div className="grid gap-2">
                {accessBreakdownRows.map((x) => (
                  <div key={x.slug} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-brand-ink">{x.title}</div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass(x.state)}`}>{x.label}</span>
                        <span className="text-xs text-zinc-500">
                          {x.included ? "Included" : creditsOnly ? "Credit-based" : "Billed"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-zinc-900">
                      {x.included ? "Included" : creditsOnly ? "Credit-based" : `${formatMoney(x.monthlyCents, x.currency)}/mo`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">No services found.</div>
          )}
        </div>

        {!creditsOnly ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Subscriptions</div>
            <div className="mt-1 text-sm text-zinc-600">Cancel any service any time.</div>

            {subscriptions && "ok" in subscriptions && subscriptions.ok === false ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {subscriptions.error ?? "Unable to load subscriptions."}
              </div>
            ) : subscriptions && "ok" in subscriptions && subscriptions.ok === true && !subscriptions.configured ? (
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                Billing isn’t configured on this environment yet.
              </div>
            ) : activeSubs.length ? (
              <div className="mt-4 grid gap-2">
                {activeSubs.map((s) => {
                  const endText = s.currentPeriodEnd ? new Date(s.currentPeriodEnd * 1000).toLocaleDateString() : null;
                  const busy = actionBusy === `cancel:${s.id}` || actionBusy === `cancel-now:${s.id}`;
                  return (
                    <div key={s.id} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-brand-ink">{s.title}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          Status: {s.status}{s.cancelAtPeriodEnd ? " • Canceling" : ""}{endText ? ` • Renews/ends: ${endText}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() =>
                            setCancelModal({
                              step: 1,
                              subscriptionId: s.id,
                              title: s.title,
                              immediate: false,
                              typed: "",
                              ack: false,
                            })
                          }
                        >
                          {s.cancelAtPeriodEnd ? "Cancel scheduled" : "Cancel"}
                        </button>
                        <button
                          type="button"
                          className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() =>
                            setCancelModal({
                              step: 1,
                              subscriptionId: s.id,
                              title: s.title,
                              immediate: true,
                              typed: "",
                              ack: false,
                            })
                          }
                        >
                          Cancel now
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-600">No active subscriptions found.</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Credits</div>
            <div className="mt-1 text-sm text-zinc-600">Usage-based actions spend credits.</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500">Balance</div>
            <div className="mt-1 text-2xl font-bold text-brand-ink">{credits ?? "N/A"}</div>
          </div>
        </div>

        {!creditsOnly && typeof creditUsdValue === "number" ? (
          <div className="mt-2 text-xs text-zinc-500">1 credit = {formatUsd(creditUsdValue)}.</div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Auto top-up</div>
              <div className="mt-1 text-xs text-zinc-500">
                When enabled, we’ll automatically charge your saved card and add credits when you run out.
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoTopUp}
              disabled={actionBusy !== null}
              onChange={(e) => void saveAutoTopUp(e.target.checked)}
            />
          </div>
        </div>

        {rewardCampaign ? (
          <div className="mt-4 rounded-2xl border border-brand-ink/10 bg-gradient-to-br from-[color:var(--color-brand-pink)]/15 via-[color:var(--color-brand-blue)]/10 to-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-[color:var(--color-brand-blue)]/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--color-brand-blue)]">
                    Sponsored
                  </span>
                  <div className="text-sm font-semibold text-zinc-900">
                    {rewardCampaign?.creative?.headline || "Purely Automation"}
                  </div>
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {rewardCampaign?.creative?.body || "A short video from Purely Automation."}
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => setAdModalOpen(true)}
                disabled={actionBusy !== null || !adEligible}
              >
                Watch
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
              {adRewardCredits > 0 ? (
                <>
                  Watch the short video to earn <span className="font-semibold">{adRewardCredits}</span> credits.
                </>
              ) : (
                <>Sponsored message</>
              )}
              {!adEligible ? <div className="mt-2 text-xs font-semibold text-zinc-500">Not available right now.</div> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <div className="text-sm font-semibold text-zinc-900">Buy credits</div>
          <div className="mt-1 text-xs text-zinc-500">
            Credits roll over. Choose an amount that lasts at least a few days.
          </div>

          {purchaseAvailable ? (
            <div className="mt-3 grid gap-2">
              <div className="flex flex-wrap gap-2">
                {creditPresets.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCreditsToBuy(c)}
                    disabled={actionBusy !== null}
                    className={
                      "rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 " +
                      (creditsRequested === c
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    {c.toLocaleString()} credits
                  </button>
                ))}

                <input
                  className="w-40 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={creditsToBuy}
                  type="number"
                  min={1}
                  step={1}
                  onChange={(e) => setCreditsToBuy(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                  disabled={actionBusy !== null}
                  aria-label="Credits to buy"
                />
              </div>

              <div className="text-xs text-zinc-500">
                Total: <span className="font-semibold text-zinc-700">{creditsRequested.toLocaleString()}</span> credits
                {!creditsOnly && typeof creditUsdValue === "number" ? (
                  <>
                    {" "}• <span className="font-semibold text-zinc-700">{formatUsd(creditsTotalUsd)}</span>
                  </>
                ) : null}
              </div>

              <button
                type="button"
                className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={actionBusy !== null}
                onClick={() => void topUp()}
              >
                {actionBusy === "topup" ? "Processing…" : "Buy credits"}
              </button>
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">Credit purchasing is unavailable right now.</div>
          )}
        </div>
      </div>

      {adModalOpen ? (
        <div className="fixed inset-0 z-[9999] bg-black/70">
          <div className="absolute inset-0 bg-white">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[color:var(--color-brand-blue)]/15 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-[color:var(--color-brand-blue)]">
                      Sponsored by Purely Automation
                    </span>
                    {adRewardCredits > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-emerald-900">
                        Earn {adRewardCredits} credits
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 truncate text-lg font-semibold text-zinc-900">
                    {rewardCampaign?.creative?.headline || "Purely Automation"}
                  </div>
                  <div className="mt-1 truncate text-sm text-zinc-600">
                    {rewardCampaign?.creative?.body || ""}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {rewardCampaign?.creative?.linkUrl ? (
                    <a
                      href={
                        `/api/portal/ads/click?campaignId=${encodeURIComponent(rewardCampaign.id)}` +
                        `&placement=FULLSCREEN_REWARD` +
                        `&path=${encodeURIComponent(pathname || "")}` +
                        `&to=${encodeURIComponent(rewardCampaign.creative.linkUrl)}`
                      }
                      className="hidden rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:inline-flex"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {rewardCampaign?.creative?.ctaText || "Open"}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    onClick={() => {
                      if (adRewardCredits > 0 && adRemainingSeconds > 0) setAdConfirmExit(true);
                      else setAdModalOpen(false);
                    }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-black">
                {rewardCampaign?.creative?.mediaUrl ? (
                  <div
                    className="mx-auto h-full w-full"
                    style={{
                      maxWidth: `min(${Math.max(
                        40,
                        Math.min(100, Math.floor(Number(rewardCampaign.creative?.fullscreenMediaMaxWidthPct || 100))),
                      )}vw, 960px)`,
                    }}
                  >
                    {rewardCampaign.creative?.mediaKind === "video" ? (
                      <video
                        ref={adVideoRef}
                        className="h-full w-full"
                        style={{
                          objectFit: rewardCampaign.creative?.mediaFit || "contain",
                          objectPosition: rewardCampaign.creative?.mediaPosition || "center",
                        }}
                        controls
                        playsInline
                        preload="auto"
                        src={rewardCampaign.creative.mediaUrl}
                        onLoadedData={() => setAdMediaReady(true)}
                        onCanPlay={() => setAdMediaReady(true)}
                        onPlay={() => setAdPlaying(true)}
                        onPause={() => setAdPlaying(false)}
                        onEnded={() => setAdPlaying(false)}
                      />
                    ) : (
                      <Image
                        className="h-full w-full"
                        style={{
                          objectFit: rewardCampaign.creative?.mediaFit || "contain",
                          objectPosition: rewardCampaign.creative?.mediaPosition || "center",
                        }}
                        src={rewardCampaign.creative.mediaUrl}
                        alt={rewardCampaign.creative?.headline || "Sponsored"}
                        width={1920}
                        height={1080}
                        unoptimized
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-white/80">
                    Media isn’t configured for this campaign.
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-200 bg-white px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-zinc-700">
                    {adRewardCredits > 0 ? (
                      adRemainingSeconds > 0 ? (
                        <>
                          Keep watching for <span className="font-semibold">{adRemainingSeconds}s</span> to unlock your credits.
                        </>
                      ) : (
                        <>
                          You’re all set. Adding your credits…
                        </>
                      )
                    ) : (
                      <>Sponsored message</>
                    )}
                    {rewardCampaign?.creative?.mediaKind === "video" && !adMediaReady ? (
                      <div className="mt-1 text-xs text-zinc-500">Loading video…</div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {rewardCampaign?.creative?.linkUrl ? (
                      <a
                        href={
                          `/api/portal/ads/click?campaignId=${encodeURIComponent(rewardCampaign.id)}` +
                          `&placement=FULLSCREEN_REWARD` +
                          `&path=${encodeURIComponent(pathname || "")}` +
                          `&to=${encodeURIComponent(rewardCampaign.creative.linkUrl)}`
                        }
                        className="inline-flex rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:hidden"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {rewardCampaign?.creative?.ctaText || "Open"}
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                      onClick={() => {
                        if (adRewardCredits > 0 && adRemainingSeconds > 0) setAdConfirmExit(true);
                        else setAdModalOpen(false);
                      }}
                    >
                      {adRewardCredits > 0 && adRemainingSeconds > 0 ? `Done (${adRemainingSeconds}s)` : "Done"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {adConfirmExit ? (
              <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setAdConfirmExit(false)}>
                <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="text-base font-semibold text-zinc-900">Stop watching?</div>
                  <div className="mt-2 text-sm text-zinc-700">
                    If you stop now, you won’t receive the {adRewardCredits} credits.
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => setAdConfirmExit(false)}
                    >
                      Keep watching
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                      onClick={() => {
                        setAdConfirmExit(false);
                        setAdModalOpen(false);
                      }}
                    >
                      Stop
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {cancelModal ? (
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-black/40 p-4"
          onMouseDown={() => setCancelModal(null)}
        >
          <div className="mx-auto w-full max-w-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
              <div className="text-sm font-semibold text-zinc-900">
                Cancel {cancelModal.title}
              </div>
              <div className="mt-1 text-sm text-zinc-600">
                {cancelModal.immediate ? "This ends access right away." : "This cancels at the end of the billing period."}
              </div>

              {cancelModal.step === 1 ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-zinc-900">You’re about to lose:</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                    {cancelBenefits(cancelModal.title).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => setCancelModal(null)}
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                      onClick={() => setCancelModal({ ...cancelModal, step: 2 })}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    This action is hard to undo. If you’re sure, type <span className="font-semibold">CANCEL</span> and confirm.
                  </div>

                  <div className="mt-3">
                    <input
                      value={cancelModal.typed}
                      onChange={(e) => setCancelModal({ ...cancelModal, typed: e.target.value })}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="Type CANCEL"
                    />
                  </div>

                  <label className="mt-3 flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={cancelModal.ack}
                      onChange={(e) => setCancelModal({ ...cancelModal, ack: e.target.checked })}
                    />
                    <span>I understand what I’m losing and still want to cancel.</span>
                  </label>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => setCancelModal(null)}
                    >
                      Go back
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-red-200 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      disabled={cancelModal.typed.trim().toUpperCase() !== "CANCEL" || !cancelModal.ack || actionBusy !== null}
                      onClick={async () => {
                        const { subscriptionId, immediate } = cancelModal;
                        setCancelModal(null);
                        await cancelOneSubscription(subscriptionId, immediate);
                      }}
                    >
                      Yes, cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!creditsOnly ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Add services</div>
          <div className="mt-2 text-sm text-zinc-600">Enable add-ons right here in the portal.</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(() => {
              const owned = (serviceSlug: string) => {
                const st = serviceStatuses?.[serviceSlug];
                const state = st?.state;
                return state && state !== "locked" && state !== "coming_soon";
              };

              const cards: Array<{
                module: "blog" | "booking" | "automations" | "reviews" | "newsletter" | "nurture" | "aiReceptionist" | "leadOutbound";
                serviceSlug: string;
                title: string;
                desc: string;
              }> = [
                { module: "blog", serviceSlug: "blogs", title: "Automated Blogs", desc: "Enable blogging automation." },
                { module: "booking", serviceSlug: "booking", title: "Booking Automation", desc: "Enable booking and reminders." },
                { module: "automations", serviceSlug: "automations", title: "Automation Builder", desc: "Build workflows across your enabled services." },
                { module: "reviews", serviceSlug: "reviews", title: "Review Requests", desc: "Automate requests and track responses." },
                { module: "newsletter", serviceSlug: "newsletter", title: "Newsletter", desc: "Send newsletters to your contacts." },
                { module: "aiReceptionist", serviceSlug: "ai-receptionist", title: "AI Receptionist", desc: "Inbound answers + routing." },
                { module: "leadOutbound", serviceSlug: "ai-outbound-calls", title: "AI Outbound", desc: "Outbound calls + follow-up messaging." },
              ];

              return cards.map((c) => (
                <div key={c.module} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">{c.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">{c.desc}</div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-2xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                    disabled={Boolean(owned(c.serviceSlug)) || actionBusy !== null}
                    onClick={() => void purchaseModule(c.module as any)}
                  >
                    {owned(c.serviceSlug) ? "Enabled" : actionBusy === `module:${c.module}` ? "Opening…" : "Enable"}
                  </button>
                </div>
              ));
            })()}
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Services & status</div>
        <div className="mt-2 text-sm text-zinc-600">Live status from your account.</div>

        <div className="mt-4 space-y-2 text-sm text-zinc-700">
          {(() => {
            const servicesList = PORTAL_SERVICES.filter((s) => !s.hidden && (!s.variants || s.variants.includes("portal")));
            const rows = servicesList.map((s) => {
              const st = serviceStatuses?.[s.slug];
              const state = st?.state ?? "active";
              const label = st?.label ?? "Ready";

              const modulePrice =
                pricing && "ok" in pricing && pricing.ok === true && s.entitlementKey
                  ? (pricing.modules as any)[s.entitlementKey]
                  : null;

              const priceText = (() => {
                if (creditsOnly && !s.included) return "Credit-based";
                if (s.included) return "Included";
                if (s.entitlementKey && modulePrice) {
                  if (modulePrice.monthlyCents) return `${formatMoney(modulePrice.monthlyCents, modulePrice.currency)}/mo`;
                  return "Included";
                }
                return "Add-on";
              })();

              const owned = state !== "locked" && state !== "coming_soon";
              return { s, st, state, label, priceText, owned };
            });

            rows.sort((a, b) => {
              if (a.owned !== b.owned) return a.owned ? -1 : 1;
              const rank = (state: string) => {
                if (state === "needs_setup") return 0;
                if (state === "active") return 1;
                if (state === "paused" || state === "canceled") return 2;
                if (state === "locked") return 3;
                return 4;
              };
              const ra = rank(a.state);
              const rb = rank(b.state);
              if (ra !== rb) return ra - rb;
              return a.s.title.localeCompare(b.s.title);
            });

            const ownedRows = rows.filter((r) => r.owned);
            const lockedRows = rows.filter((r) => !r.owned);

            const renderRow = (r: typeof rows[number]) => {
              const { s, state, label, priceText } = r;
              const busy = actionBusy?.startsWith(`service:${s.slug}:`) ?? false;
              const canLifecycleManage = !s.included;
              const badgeText = (() => {
                if (state === "locked" || state === "coming_soon") return label;
                if (state === "paused" || state === "canceled") return label;
                const access = s.included ? "Included" : "Enabled";
                return `${access} · ${label}`;
              })();

              return (
                <div
                  key={s.slug}
                  className="relative flex items-center justify-between gap-3"
                  data-service-menu-root={serviceMenuSlug === s.slug ? s.slug : undefined}
                >
                  <div className="min-w-0">
                    <div className="truncate">{s.title}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{priceText}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {state === "locked" ? (
                      !creditsOnly && s.entitlementKey && modulePurchasable(s.entitlementKey as any) ? (
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => openPurchaseModal(s.entitlementKey as any, s.title)}
                          className="hidden rounded-2xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 sm:inline-flex"
                        >
                          Enable
                        </button>
                      ) : (
                        <span className="hidden text-xs font-semibold text-zinc-400 sm:inline-flex">Not available</span>
                      )
                    ) : state === "paused" || state === "canceled" ? (
                      <button
                        type="button"
                        disabled={busy || actionBusy !== null}
                        onClick={() => void setServiceLifecycle(s.slug, "resume")}
                        className="hidden rounded-2xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 sm:inline-flex"
                      >
                        Resume
                      </button>
                    ) : null}

                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass(state)}`}>
                      {badgeText}
                    </span>

                    <button
                      type="button"
                      disabled={actionBusy !== null}
                      onClick={() => setServiceMenuSlug((prev) => (prev === s.slug ? null : s.slug))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      aria-label="Service actions"
                    >
                      ⋯
                    </button>

                    {serviceMenuSlug === s.slug ? (
                      <div className="absolute right-0 top-9 z-20 w-48 rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg">
                        {state === "locked" ? (
                          !creditsOnly && s.entitlementKey && modulePurchasable(s.entitlementKey as any) ? (
                            <button
                              type="button"
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                              onClick={() => openPurchaseModal(s.entitlementKey as any, s.title)}
                            >
                              Enable…
                            </button>
                          ) : (
                            <div className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-500">Not available</div>
                          )
                        ) : state === "needs_setup" ? (
                          <button
                            type="button"
                            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => router.push(setupHrefForService(s.slug, label))}
                          >
                            {setupActionLabelForService(s.slug, label)}…
                          </button>
                        ) : state === "coming_soon" ? (
                          <div className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-500">Coming soon</div>
                        ) : state === "paused" || state === "canceled" ? (
                          <button
                            type="button"
                            disabled={busy || actionBusy !== null}
                            onClick={() => void setServiceLifecycle(s.slug, "resume")}
                            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Resume service
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canLifecycleManage || busy || actionBusy !== null}
                            onClick={() => void setServiceLifecycle(s.slug, "pause")}
                            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Pause service
                          </button>
                        )}

                        {state === "active" && canLifecycleManage ? (
                          <button
                            type="button"
                            disabled={busy || actionBusy !== null}
                            onClick={() => void setServiceLifecycle(s.slug, "cancel")}
                            className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Cancel service
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            };

            return (
              <>
                {ownedRows.length ? (
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">You have access</div>
                ) : null}
                {ownedRows.map(renderRow)}

                {lockedRows.length ? (
                  <>
                    <div className="my-4 border-t border-zinc-200" />
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Add-ons you don’t have yet</div>
                    {lockedRows.map(renderRow)}
                  </>
                ) : null}
              </>
            );
          })()}
        </div>

        <div className="mt-6 rounded-2xl border border-brand-ink/10 bg-gradient-to-br from-[color:var(--color-brand-blue)]/10 to-white p-4 text-sm text-zinc-800">
          <div className="font-semibold text-zinc-900">Want to add more?</div>
          <div className="mt-1 text-sm text-zinc-700">
            {creditsOnly
              ? "Top up credits above, or open a service to configure it."
              : "Enable add-ons above, or open a service to configure it."}
          </div>
        </div>
      </div>
    </div>
  );
}
