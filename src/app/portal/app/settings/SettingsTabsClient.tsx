"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ToastProvider";
import { AppModal } from "@/components/AppModal";
import { formatPhoneForDisplay, normalizePhoneStrict } from "@/lib/phone";
import { PortalBillingClient } from "@/app/portal/billing/PortalBillingClient";
import { PortalBillingUpgradeClient } from "@/app/portal/billing/PortalBillingUpgradeClient";
import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";
import { BuyCreditsModal } from "@/app/portal/billing/BuyCreditsModal";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { IconBillingGlyph, IconProfileGlyph, IconSettingsGlyph } from "@/app/portal/PortalIcons";

type TabKey = "general" | "profile" | "billing";

type ProfileRes =
  | {
      ok: true;
      user: {
        name: string;
        email: string;
        phone?: string | null;
      } | null;
    }
  | { ok?: false; error?: string };

type CreditsRes =
  | {
      credits?: number;
      creditUsdValue?: number;
      purchaseAvailable?: boolean;
    }
  | { error?: string };

type ServicesStatusResponse =
  | {
      ok: true;
      billingModel?: "subscription" | "credits";
      statuses: Record<
        string,
        { state: "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled"; label: string }
      >;
    }
  | { ok: false; error?: string };

type ReportingRes =
  | {
      ok: true;
      startIso: string;
      endIso: string;
      creditsRemaining: number;
      kpis: {
        automationsRun: number;
        aiCalls: number;
        missedCallAttempts: number;
        textsSent: number;
        leadScrapeRuns: number;
        blogGenerations: number;
        creditsUsed: number;
        bookingsCreated: number;
        reviewsCollected: number;
        aiOutboundQueuedNow: number;
        aiOutboundCompleted: number;
        nurtureEnrollmentsCreated: number;
        newsletterSendEvents: number;
        tasksCompleted: number;
        inboxMessagesIn: number;
      };
    }
  | { ok?: false; error?: string };

type ReferralRes =
  | { url: string; code: string; stats: { total: number; verified: number; awarded: number } }
  | null;

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeTab(raw: string | null | undefined): TabKey {
  const v = (raw || "").trim().toLowerCase();
  if (v === "profile") return "profile";
  if (v === "billing") return "billing";
  return "general";
}

function setSearchParam(url: URL, key: string, value: string | null) {
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetweenIso(startIso: string, endIso: string): number {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return 30;
  const raw = Math.ceil((e.getTime() - s.getTime()) / MS_PER_DAY);
  return Math.max(1, raw);
}

export function SettingsTabsClient({ generalOnly = false }: { generalOnly?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const tab = useMemo<TabKey>(() => (generalOnly ? "general" : normalizeTab(searchParams?.get("tab"))), [generalOnly, searchParams]);
  const focus = (searchParams?.get("focus") || "").trim().toLowerCase();

  const goTab = useCallback(
    (nextTab: TabKey, opts?: { focus?: string | null }) => {
      const url = new URL(window.location.href);
      setSearchParam(url, "tab", nextTab);
      if (opts && "focus" in opts) setSearchParam(url, "focus", opts.focus ?? null);
      else url.searchParams.delete("focus");
      router.push(url.pathname + url.search, { scroll: false });
    },
    [router],
  );

  return (
    <div className="mt-5">
      {!generalOnly ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex w-full flex-wrap items-center gap-2">
            {([
              { key: "general" as const, label: "General", icon: <IconSettingsGlyph size={16} /> },
              { key: "profile" as const, label: "Profile", icon: <IconProfileGlyph size={16} /> },
              { key: "billing" as const, label: "Billing", icon: <IconBillingGlyph size={16} /> },
            ] as const).map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => goTab(t.key)}
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "bg-[rgba(29,78,216,0.10)] text-(--color-brand-blue) ring-1 ring-[rgba(29,78,216,0.22)]"
                      : "bg-transparent text-zinc-600 hover:bg-zinc-100/60 hover:text-zinc-900",
                  )}
                >
                  <span aria-hidden="true" className="text-current">
                    {t.icon}
                  </span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "general" ? (
        <GeneralTab
          onGoServices={() => {
            const base = typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "/credit" : "/portal";
            router.push(`${base}/app/services`, { scroll: false });
          }}
          toast={toast}
        />
      ) : null}

      {tab === "profile" ? (
        <div className="mt-6">
          <PortalProfileClient embedded />
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="mt-6">
          <BillingTab focus={focus} />
        </div>
      ) : null}
    </div>
  );
}

function GeneralTab({
  onGoServices,
  toast,
}: {
  onGoServices: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [profile, setProfile] = useState<ProfileRes | null>(null);
  const [credits, setCredits] = useState<CreditsRes | null>(null);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [services, setServices] = useState<ServicesStatusResponse | null>(null);
  const [reporting, setReporting] = useState<ReportingRes | null>(null);
  const [serviceUsage, setServiceUsage] = useState<Record<string, number>>({});
  const [referral, setReferral] = useState<ReferralRes>(null);
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralLoading, setReferralLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [saving, setSaving] = useState(false);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pendingSave, setPendingSave] = useState(false);

  const loadReferral = useCallback(async () => {
    setReferralLoading(true);
    try {
      const res = await fetch("/api/portal/referrals/link", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const json = (await res.json().catch(() => ({}))) as unknown;
      const okJson = json && typeof json === "object" && !Array.isArray(json) ? (json as any) : null;
      if (!okJson?.ok) return;
      setReferral({
        url: String(okJson.url || ""),
        code: String(okJson.code || ""),
        stats: {
          total: Number(okJson?.stats?.total ?? 0) || 0,
          verified: Number(okJson?.stats?.verified ?? 0) || 0,
          awarded: Number(okJson?.stats?.awarded ?? 0) || 0,
        },
      });
    } finally {
      setReferralLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [pRes, cRes, sRes] = await Promise.all([
        fetch("/api/portal/profile", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/credits", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/services/status", { cache: "no-store" }).catch(() => null as any),
      ]);
      if (!mounted) return;

      if (pRes?.ok) {
        const p = (await pRes.json().catch(() => null)) as ProfileRes | null;
        setProfile(p);
        const u = p && "ok" in p && (p as any).ok ? (p as any).user : null;
        setName(u?.name ?? "");
        setEmail(u?.email ?? "");
        setPhone(formatPhoneForDisplay(u?.phone ?? ""));
      } else {
        const j = pRes ? await pRes.json().catch(() => ({})) : ({} as any);
        setProfile({ ok: false, error: j?.error ?? "Unable to load" } as any);
      }

      if (cRes?.ok) setCredits(((await cRes.json().catch(() => null)) as CreditsRes | null) ?? null);
      else setCredits(null);

      if (sRes?.ok) setServices(((await sRes.json().catch(() => null)) as ServicesStatusResponse | null) ?? null);
      else setServices(null);

      const [rRes, blogsRes, newsletterRes] = await Promise.all([
        fetch("/api/portal/reporting?range=30d", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/blogs/usage?range=30d", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/newsletter/usage?range=30d", { cache: "no-store" }).catch(() => null as any),
      ]);

      if (!mounted) return;

      if (rRes?.ok) setReporting(((await rRes.json().catch(() => null)) as ReportingRes | null) ?? null);
      else setReporting(null);

      const nextUsage: Record<string, number> = {};

      if (blogsRes?.ok) {
        const j = (await blogsRes.json().catch(() => null)) as any;
        if (j?.ok) nextUsage.blogs = Number(j?.generations?.range ?? 0) || 0;
      }

      if (newsletterRes?.ok) {
        const j = (await newsletterRes.json().catch(() => null)) as any;
        if (j?.ok) nextUsage.newsletter = Number(j?.generations?.range ?? 0) || 0;
      }

      setServiceUsage(nextUsage);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const billingModel = services && "ok" in services && services.ok ? services.billingModel : undefined;
  const creditsOnly = billingModel === "credits";

  const originalName = (profile && "ok" in profile && (profile as any).ok ? (profile as any).user?.name : "") ?? "";
  const originalEmail = (profile && "ok" in profile && (profile as any).ok ? (profile as any).user?.email : "") ?? "";
  const originalPhone = (profile && "ok" in profile && (profile as any).ok ? (profile as any).user?.phone : "") ?? "";

  const phoneValidation = useMemo(() => normalizePhoneStrict(phone), [phone]);

  const wantsNameChange = name.trim() !== String(originalName || "");
  const wantsEmailChange = email.trim().toLowerCase() !== String(originalEmail || "").trim().toLowerCase();
  const wantsPhoneChange = (() => {
    const nextRaw = phone.trim();
    const nextE164 = nextRaw ? (phoneValidation.ok ? phoneValidation.e164 : null) : null;
    const cur = String(originalPhone || "").trim();
    if (!nextRaw && !cur) return false;
    return String(nextE164 || "") !== cur;
  })();

  const hasAnyChanges = wantsNameChange || wantsEmailChange || wantsPhoneChange;
  const needsPassword = wantsNameChange || wantsEmailChange;

  const canSave = hasAnyChanges && (!phone.trim() || phoneValidation.ok) && name.trim().length >= 2 && email.trim().length >= 3;

  const saveLabel = saving ? "Saving…" : hasAnyChanges ? "Save" : "Saved";

  async function doSave(currentPassword: string | null) {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      };
      if (needsPassword && currentPassword) payload.currentPassword = currentPassword;

      const res = await fetch("/api/portal/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);

      const json = res ? ((await res.json().catch(() => ({}))) as any) : null;
      if (!res || !res.ok || !json?.ok) {
        toast.error(json?.error || (!res ? "Unable to reach server" : "Unable to save"));
        return;
      }

      setProfile({ ok: true, user: json.user } as any);
      setPw("");
      setPwModalOpen(false);
      setPendingSave(false);
      toast.success(json?.note || "Saved.");
    } finally {
      setSaving(false);
    }
  }

  const creditsRemaining = useMemo(() => {
    if (typeof (reporting as any)?.creditsRemaining === "number" && Number.isFinite((reporting as any).creditsRemaining)) {
      return Number((reporting as any).creditsRemaining);
    }
    if (typeof (credits as any)?.credits === "number" && Number.isFinite((credits as any).credits)) return Number((credits as any).credits);
    return null;
  }, [credits, reporting]);

  const formattedCreditsRemaining = useMemo(() => {
    if (typeof creditsRemaining !== "number" || !Number.isFinite(creditsRemaining)) return "N/A";
    return Math.max(0, Math.round(creditsRemaining)).toLocaleString();
  }, [creditsRemaining]);

  const creditRunwayDays = useMemo(() => {
    if (!reporting || !("ok" in reporting) || !reporting.ok) return null;
    const creditsUsed = Number((reporting as any)?.kpis?.creditsUsed ?? 0) || 0;
    const remaining = Number((reporting as any)?.creditsRemaining ?? 0);
    if (!Number.isFinite(remaining)) return null;
    if (creditsUsed <= 0) return null;
    const days = daysBetweenIso(reporting.startIso, reporting.endIso);
    const perDay = creditsUsed / days;
    if (perDay <= 0) return null;
    return Math.max(0, Math.round(remaining / perDay));
  }, [reporting]);

  const estimatedMonthlyCredits = useMemo(() => {
    if (!reporting || !("ok" in reporting) || !reporting.ok) return null;
    const creditsUsed = Number((reporting as any)?.kpis?.creditsUsed ?? 0) || 0;
    if (creditsUsed <= 0) return null;
    const days = daysBetweenIso(reporting.startIso, reporting.endIso);
    const perDay = creditsUsed / days;
    if (perDay <= 0) return null;
    return Math.max(1, Math.round(perDay * 30));
  }, [reporting]);

  const startCreditsCheckout = useCallback(
    async (creditsToBuy: number) => {
      const requested = Math.max(1, Math.floor(Number(creditsToBuy) || 0));

      // Open a new tab immediately to avoid popup blockers.
      let checkoutTab: Window | null = null;
      try {
        checkoutTab = window.open("about:blank", "_blank");
        if (checkoutTab) checkoutTab.opener = null;
      } catch {
        checkoutTab = null;
      }

      try {
        const res = await fetch("/api/portal/credits/topup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credits: requested }),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          toast.error(body?.error ?? "Unable to purchase credits");
          try {
            if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
          } catch {
            // ignore
          }
          return;
        }

        if (body?.url && typeof body.url === "string") {
          try {
            if (checkoutTab && !checkoutTab.closed) {
              checkoutTab.location.href = body.url;
            } else {
              const opened = window.open(body.url, "_blank", "noopener,noreferrer");
              if (!opened) window.location.href = body.url;
            }
          } catch {
            window.location.href = body.url;
          }
          return;
        }

        // Dev/test fallback credits add.
        const cRes = await fetch("/api/portal/credits", { cache: "no-store" }).catch(() => null as any);
        if (cRes?.ok) setCredits(((await cRes.json().catch(() => null)) as CreditsRes | null) ?? null);
      } finally {
      }
    },
    [toast],
  );

  const runwayTone = useMemo(() => {
    if (typeof creditRunwayDays !== "number" || !Number.isFinite(creditRunwayDays)) return "ok" as const;
    if (creditRunwayDays <= 3) return "danger" as const;
    if (creditRunwayDays <= 7) return "warn" as const;
    return "good" as const;
  }, [creditRunwayDays]);

  const topServices = useMemo(() => {
    if (!services || !("ok" in services) || !services.ok) return [] as Array<{ slug: string; title: string; state: string; label: string; usage: number }>;

    const usage: Record<string, number> = {};
    if (reporting && "ok" in reporting && reporting.ok) {
      const k = reporting.kpis as any;
      usage["automations"] = Number(k.automationsRun ?? 0) || 0;
      usage["ai-receptionist"] = Number(k.aiCalls ?? 0) || 0;
      usage["missed-call-textback"] = Number(k.missedCallAttempts ?? 0) || 0;
      usage["follow-up"] = Number(k.textsSent ?? 0) || 0;
      usage["lead-scraping"] = Number(k.leadScrapeRuns ?? 0) || 0;
      usage["blogs"] = Number(serviceUsage.blogs ?? k.blogGenerations ?? 0) || 0;
      usage["booking"] = Number(k.bookingsCreated ?? 0) || 0;
      usage["reviews"] = Number(k.reviewsCollected ?? 0) || 0;
      usage["ai-outbound-calls"] = (Number(k.aiOutboundQueuedNow ?? 0) || 0) + (Number(k.aiOutboundCompleted ?? 0) || 0);
      usage["nurture-campaigns"] = Number(k.nurtureEnrollmentsCreated ?? 0) || 0;
      usage["newsletter"] = Number(serviceUsage.newsletter ?? k.newsletterSendEvents ?? 0) || 0;
      usage["tasks"] = Number(k.tasksCompleted ?? 0) || 0;
      usage["inbox"] = Number(k.inboxMessagesIn ?? 0) || 0;
    }

    const eligibleStates = new Set(["active", "needs_setup", "paused"]);
    const rows: Array<{ slug: string; title: string; state: string; label: string; usage: number }> = [];
    for (const svc of PORTAL_SERVICES) {
      if (svc.hidden) continue;
      const st = (services.statuses as any)?.[svc.slug];
      if (!st) continue;
      const state = String(st.state || "");
      if (!eligibleStates.has(state)) continue;
      rows.push({
        slug: svc.slug,
        title: svc.title,
        state,
        label: String(st.label || ""),
        usage: Number(usage[svc.slug] ?? 0) || 0,
      });
    }

    const stateScore = (state: string) => (state === "active" ? 0 : state === "needs_setup" ? 1 : state === "paused" ? 2 : 3);
    const anyUsage = rows.some((r) => r.usage > 0);
    rows.sort((a, b) => {
      if (anyUsage && a.usage !== b.usage) return b.usage - a.usage;
      return stateScore(a.state) - stateScore(b.state);
    });

    return rows.slice(0, 3);
  }, [reporting, services, serviceUsage.blogs, serviceUsage.newsletter]);

  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
        <div className="h-full">
          <div className="flex h-full flex-col">
            <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setPhone(formatPhoneForDisplay(phone))}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="+1 (555) 123-4567"
              />
              {!phoneValidation.ok && phone.trim() ? (
                <div className="mt-2 text-xs text-red-700">{phoneValidation.error}</div>
              ) : null}
            </div>

            <div className="pt-1">
              <button
                type="button"
                className={classNames(
                  "inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-60",
                  canSave ? "bg-brand-blue hover:opacity-95" : "bg-zinc-400",
                )}
                disabled={!canSave || saving}
                onClick={() => {
                  if (!needsPassword) {
                    void doSave(null);
                    return;
                  }
                  setPendingSave(true);
                  setPwModalOpen(true);
                }}
              >
                {saveLabel}
              </button>
              {needsPassword ? (
                <div className="mt-2 text-xs text-zinc-500">Name and email changes require your current password.</div>
              ) : null}
            </div>
          </div>
          </div>
        </div>

        <div className="relative h-full overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div
            className={classNames(
              "pointer-events-none absolute inset-0",
              runwayTone === "good"
                ? "bg-[radial-gradient(ellipse_220px_220px_at_100%_0%,rgba(16,185,129,0.45)_0%,rgba(16,185,129,0.18)_35%,transparent_70%)]"
                : runwayTone === "warn"
                  ? "bg-[radial-gradient(ellipse_220px_220px_at_100%_0%,rgba(251,191,36,0.45)_0%,rgba(251,191,36,0.18)_35%,transparent_70%)]"
                  : runwayTone === "danger"
                    ? "bg-[radial-gradient(ellipse_220px_220px_at_100%_0%,rgba(244,63,94,0.42)_0%,rgba(244,63,94,0.16)_35%,transparent_70%)]"
                    : "bg-[radial-gradient(ellipse_220px_220px_at_100%_0%,rgba(29,78,216,0.22)_0%,rgba(29,78,216,0.10)_35%,transparent_70%)]",
            )}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full flex-col p-4">
            <div className="text-sm font-semibold text-zinc-900">Credits</div>

            <div className="mt-2 min-w-0 flex-1 overflow-hidden text-[clamp(3.5rem,10vw,6.5rem)] font-extrabold leading-[0.88] tracking-[-0.06em] text-brand-ink sm:text-[clamp(4rem,8vw,7.5rem)]">
              <span className="block max-w-full overflow-hidden text-ellipsis break-all sm:break-normal">{formattedCreditsRemaining}</span>
            </div>

            <div className="-mt-1 text-sm font-semibold">
              <span className="text-zinc-600">Runway:</span>{" "}
              <span
                className={classNames(
                  runwayTone === "good"
                    ? "text-emerald-700"
                    : runwayTone === "warn"
                      ? "text-amber-700"
                      : runwayTone === "danger"
                        ? "text-rose-700"
                        : "text-zinc-800",
                )}
              >
                {typeof creditRunwayDays === "number" && Number.isFinite(creditRunwayDays) ? `${creditRunwayDays} days` : "N/A"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-3 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-2xl bg-(--color-brand-blue) px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                onClick={() => setBuyCreditsOpen(true)}
              >
                Buy more
              </button>
              <button
                type="button"
                className="rounded-2xl bg-(--color-brand-pink) px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                onClick={() => {
                  setReferralOpen(true);
                  if (!referral && !referralLoading) void loadReferral();
                }}
              >
                Get free credits
              </button>
            </div>
          </div>
        </div>

        <BuyCreditsModal
          open={buyCreditsOpen}
          onClose={() => setBuyCreditsOpen(false)}
          purchaseAvailable={Boolean((credits as any)?.purchaseAvailable ?? true)}
          creditUsdValue={typeof (credits as any)?.creditUsdValue === "number" ? (credits as any).creditUsdValue : null}
          estimatedMonthlyCredits={estimatedMonthlyCredits}
          onStartCheckout={startCreditsCheckout}
        />

        <div className="flex h-full flex-col">
          <div className="text-sm font-semibold text-zinc-900">Top services</div>

          {topServices.length ? (
            <div className="mt-3 flex-1 divide-y divide-zinc-200">
              {topServices.map((s, idx) => (
                <div key={s.slug} className="flex items-center gap-3 py-3">
                  <div
                    className={classNames(
                      "w-14 text-center text-5xl font-extrabold leading-none",
                      idx === 0 ? "text-brand-blue" : "text-brand-ink",
                    )}
                  >
                    {idx + 1}
                  </div>
                  <div className="min-w-0 truncate text-lg font-semibold leading-tight text-brand-ink">
                    {s.title}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex-1 text-sm text-zinc-600">No services found.</div>
          )}

          <div className="mt-auto pt-4">
            <button
              type="button"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                onClick={onGoServices}
            >
              See all services
            </button>
          </div>
        </div>
      </div>

      {creditsOnly ? (
        <div className="mt-12 w-full">
          <div className="text-base font-semibold text-zinc-900">Upgrade to a monthly plan</div>
          <div className="mt-1 text-sm text-zinc-600">Lower per-action costs, higher limits, and a predictable monthly price.</div>
          <div className="mt-6">
            <PortalBillingUpgradeClient embedded />
          </div>
        </div>
      ) : null}

      <AppModal
        open={pwModalOpen}
        onClose={() => {
          if (saving) return;
          setPwModalOpen(false);
          setPendingSave(false);
        }}
        title="Confirm changes"
      >
        <div className="space-y-3">
          <div className="text-sm text-zinc-600">Enter your current password to update your name or email.</div>
          <div>
            <label className="text-xs font-semibold text-zinc-600">Current password</label>
            <input
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="Current password"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              onClick={() => {
                setPwModalOpen(false);
                setPendingSave(false);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              onClick={() => {
                if (!pendingSave) return;
                void doSave(pw);
              }}
              disabled={saving || pw.trim().length < 6}
            >
              {saving ? "Saving…" : "Confirm and save"}
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={referralOpen}
        onClose={() => setReferralOpen(false)}
        title="Get free credits"
        closeVariant="x"
        hideHeaderDivider
      >
        <div className="space-y-4">
          <div className="text-sm text-zinc-600">Share your referral link. When friends sign up and verify, you earn credits.</div>

          <div>
            <label className="text-xs font-semibold text-zinc-600">Referral link</label>
            <div className="mt-1 flex gap-2">
              <input
                value={referral?.url || (referralLoading ? "Loading…" : "")}
                readOnly
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="Loading…"
              />
              <button
                type="button"
                className="shrink-0 rounded-2xl bg-(--color-brand-blue) px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={!referral?.url}
                onClick={() => {
                  if (!referral?.url) return;
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(referral.url);
                      toast.success("Copied referral link.");
                    } catch {
                      toast.error("Unable to copy.");
                    }
                  })();
                }}
              >
                Copy
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">Invites</div>
              <div className="mt-1 text-lg font-bold text-brand-ink">{referral?.stats.total ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">Verified</div>
              <div className="mt-1 text-lg font-bold text-brand-ink">{referral?.stats.verified ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">Awarded</div>
              <div className="mt-1 text-lg font-bold text-brand-ink">{referral?.stats.awarded ?? 0}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              onClick={() => setReferralOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}

function BillingTab({ focus }: { focus: string }) {
  useEffect(() => {
    if (!focus) return;
    const id =
      focus === "referral"
        ? "pa-billing-referral"
        : focus === "credits"
          ? "pa-billing-credits"
          : focus === "services"
            ? "pa-billing-services"
            : null;
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;

    let parent: HTMLElement | null = el.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      const overflowY = style.overflowY;
      const canScrollY =
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        parent.scrollHeight > parent.clientHeight + 1;
      if (canScrollY) {
        const parentRect = parent.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        const top = parent.scrollTop + (rect.top - parentRect.top) - 16;
        parent.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        return;
      }
      parent = parent.parentElement;
    }

    const top = window.scrollY + el.getBoundingClientRect().top - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [focus]);

  return (
    <div>
      <PortalBillingClient hideMonthlyBreakdown />
    </div>
  );
}
