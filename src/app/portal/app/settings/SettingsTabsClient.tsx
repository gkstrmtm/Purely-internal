"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ToastProvider";
import { AppModal } from "@/components/AppModal";
import { formatPhoneForDisplay, normalizePhoneStrict } from "@/lib/phone";
import { PortalBillingClient } from "@/app/portal/billing/PortalBillingClient";
import { PortalBillingUpgradeClient } from "@/app/portal/billing/PortalBillingUpgradeClient";
import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

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

export function SettingsTabsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const tab = useMemo<TabKey>(() => normalizeTab(searchParams?.get("tab")), [searchParams]);
  const focus = (searchParams?.get("focus") || "").trim().toLowerCase();

  const goTab = useCallback(
    (nextTab: TabKey, opts?: { focus?: string | null }) => {
      const url = new URL(window.location.href);
      setSearchParam(url, "tab", nextTab);
      if (opts && "focus" in opts) setSearchParam(url, "focus", opts.focus ?? null);
      else url.searchParams.delete("focus");
      router.push(url.pathname + url.search);
    },
    [router],
  );

  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="inline-flex w-full flex-wrap items-center gap-2">
          {([
            { key: "general" as const, label: "General" },
            { key: "profile" as const, label: "Profile" },
            { key: "billing" as const, label: "Billing" },
          ] as const).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => goTab(t.key)}
                className={classNames(
                  "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "border-zinc-200 bg-white text-brand-ink"
                    : "border-zinc-200 bg-transparent text-zinc-700 hover:bg-white/70",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "general" ? (
        <GeneralTab
          onGoBilling={(where) => goTab("billing", { focus: where })}
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
  onGoBilling,
  toast,
}: {
  onGoBilling: (focus: string | null) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [profile, setProfile] = useState<ProfileRes | null>(null);
  const [credits, setCredits] = useState<CreditsRes | null>(null);
  const [services, setServices] = useState<ServicesStatusResponse | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [saving, setSaving] = useState(false);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pendingSave, setPendingSave] = useState(false);

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

  const topServices = useMemo(() => {
    if (!services || !("ok" in services) || !services.ok) return [] as Array<{ slug: string; title: string; state: string; label: string }>;
    const rows: Array<{ slug: string; title: string; state: string; label: string }> = [];
    for (const svc of PORTAL_SERVICES) {
      if (svc.hidden) continue;
      const st = (services.statuses as any)?.[svc.slug];
      if (!st) continue;
      const state = String(st.state || "");
      const label = String(st.label || "");
      rows.push({ slug: svc.slug, title: svc.title, state, label });
    }

    const score = (state: string) => (state === "active" ? 0 : state === "needs_setup" ? 1 : state === "paused" ? 2 : 3);
    rows.sort((a, b) => score(a.state) - score(b.state));
    return rows.slice(0, 6);
  }, [services]);

  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Contact</div>
          <div className="mt-1 text-sm text-zinc-600">Name, email, and phone.</div>

          <div className="mt-4 space-y-3">
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
                  canSave ? "bg-brand-ink hover:opacity-95" : "bg-zinc-400",
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
                {saving ? "Saving…" : canSave ? "Save" : "Saved"}
              </button>
              {needsPassword ? (
                <div className="mt-2 text-xs text-zinc-500">Name and email changes require your current password.</div>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Credits</div>
                <div className="mt-1 text-sm text-zinc-600">Your balance for usage-based actions.</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-500">Balance</div>
                <div className="mt-1 text-2xl font-bold text-brand-ink">
                  {typeof (credits as any)?.credits === "number" ? (credits as any).credits : "N/A"}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-2xl bg-[linear-gradient(90deg,var(--color-brand-blue),var(--color-brand-pink))] px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                onClick={() => onGoBilling("credits")}
              >
                Buy more
              </button>
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                onClick={() => onGoBilling("referral")}
              >
                Get free credits
              </button>
            </div>
          </div>

          {creditsOnly ? (
            <details className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
              <summary className="cursor-pointer list-none text-sm font-semibold text-brand-ink select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                Upgrade to a monthly plan
              </summary>
              <div className="mt-4">
                <PortalBillingUpgradeClient embedded />
              </div>
            </details>
          ) : null}
        </div>

        <div>
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Top services</div>
            <div className="mt-1 text-sm text-zinc-600">Quick links to what you use most.</div>

            {topServices.length ? (
              <div className="mt-4 space-y-2">
                {topServices.map((s) => (
                  <a
                    key={s.slug}
                    href={`/portal/app/services/${encodeURIComponent(s.slug)}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-brand-ink">{s.title}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">{s.label}</div>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-zinc-600">Open</div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-zinc-600">No services found.</div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}

function BillingTab({ focus }: { focus: string }) {
  useEffect(() => {
    if (!focus) return;
    const id = focus === "referral" ? "pa-billing-referral" : focus === "credits" ? "pa-billing-credits" : null;
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  return (
    <div>
      <PortalBillingClient hideMonthlyBreakdown />
    </div>
  );
}
