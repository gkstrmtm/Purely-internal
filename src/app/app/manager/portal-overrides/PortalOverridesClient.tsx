"use client";

import { useEffect, useMemo, useState } from "react";

import { ToggleSwitch } from "@/components/ToggleSwitch";
import { useToast } from "@/components/ToastProvider";
import { ElevenLabsConvaiWidget } from "@/components/ElevenLabsConvaiWidget";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@/lib/entitlements.shared";

type UserRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  invitesSentCount?: number;
  invitesVerifiedCount?: number;
  inviteCreditsAwardedCount?: number;
  overrides: ModuleKey[];
  creditsOnlyOverride?: boolean;
  creditsBalance?: number;
  phone?: string | null;
  businessName?: string | null;
  businessEmail?: string | null;
  twilio?: { configured: boolean; fromNumberE164: string | null };
  voiceAgentIds?: { profile: string | null; aiReceptionist: string | null };
};

type OverridesResponse = {
  users: UserRow[];
  modules: ModuleKey[];
};

type OwnerDetails = {
  ok: true;
  owner: {
    id: string;
    email: string;
    name: string;
    active: boolean;
    role: string;
    deletedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    timeZone: string;
    stripe: { connected: boolean; accountId: string | null; connectedAt: string | null };
    portal: {
      creditsOnlyOverride: boolean;
      creditsBalance: number;
      overrides: ModuleKey[];
      phone: string | null;
      mailboxEmail: string | null;
    };
    ai: { voiceAgentIds: { profile: string | null; aiReceptionist: string | null } };
    integrations: {
      twilio: { configured: boolean; fromNumberE164: string | null };
      salesReporting: {
        activeProvider: string | null;
        connectedProviders: Array<{ provider: string; displayHint: string | null }>;
      };
    };
    businessProfile:
      | null
      | {
          businessName: string;
          websiteUrl?: string | null;
          industry?: string | null;
          businessModel?: string | null;
          primaryGoals?: unknown;
          targetCustomer?: string | null;
          brandVoice?: string | null;
          logoUrl?: string | null;
          brandPrimaryHex?: string | null;
          brandAccentHex?: string | null;
          brandTextHex?: string | null;
          brandFontFamily?: string | null;
          brandFontGoogleFamily?: string | null;
          updatedAt?: string | null;
        };
    content: {
      blogSite:
        | null
        | {
            name: string;
            slug: string | null;
            primaryDomain: string | null;
            verifiedAt: string | null;
            posts: { total: number; published: number; draft: number };
          };
    };
    usage: {
      since30: string;
      lastActivityAt: string | null;
      mostUsedServices: Array<{ key: string; count: number }>;
      portalEngagement?: {
        lastSeenAt: string | null;
        lastSeenPath: string | null;
        lastSeenPageKey: string | null;
        topPages: Array<{ key: string; seconds: number }>;
        topServicesByTime: Array<{ key: string; seconds: number }>;
        recentActivity: Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }>;
      };
      portalDiagnostics?: {
        lastSeenAt: string | null;
        actionFailureCount: number;
        runtimeErrorCount: number;
        unhandledRejectionCount: number;
        resourceErrorCount: number;
        segments: {
          localOperator: number;
          previewOperator: number;
          productionOperator: number;
          customerFacing: number;
          unknown: number;
        };
        contexts: {
          environments: Array<{ key: string; label: string; count: number }>;
          surfaces: Array<{ key: string; label: string; count: number }>;
          audiences: Array<{ key: string; label: string; count: number }>;
          hosts: Array<{ key: string; label: string; count: number }>;
        };
        topPaths: Array<{ path: string; count: number }>;
        topActions: Array<{ area: string; action: string; count: number }>;
        recentEvents: Array<{
          id: string;
          kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure";
          createdAtIso: string;
          lastSeenAtIso: string;
          count: number;
          message: string;
          path?: string;
          source?: string;
          file?: string;
          line?: number;
          column?: number;
          area?: string | null;
          action?: string | null;
          status?: number | null;
          viewHost?: string | null;
          viewEnvironment: string;
          viewSurface: string;
          viewAudience: string;
        }>;
        bugReports: { count: number; lastReportedAt: string | null };
      };
      newsletter: { failedLast30: number; sentLast30: number; requestedLast30: number; sendEventsLast30: number };
      leadScraping: { runsLast30: number; createdLast30: number; chargedCreditsLast30: number; errorsLast30: number };
      booking: { site: { enabled: boolean; slug: string; title: string } | null; bookingsCreatedLast30: number; bookingsUpcoming: number };
      hoursSaved: { secondsLast30: number; eventsLast30: number };
      reviews: { receivedLast30: number };
      blog: { generationEventsLast30: number };
    };
  };
  hostedLinks?: {
    funnels: Array<{ name: string; slug: string; url: string; pages: Array<{ title: string; slug: string; url: string }> }>;
    blog: null | { indexUrl: string; posts: Array<{ title: string; slug: string; url: string }> };
    newsletters: null | { indexUrl: string; items: Array<{ title: string; slug: string; url: string }> };
    reviews: null | { indexUrl: string };
    booking: null | { url: string; slug: string };
  };
};

async function fetchOverrides(q: string): Promise<OverridesResponse> {
  const url = new URL("/api/manager/portal/overrides", window.location.origin);
  if (q.trim()) url.searchParams.set("q", q.trim());
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load overrides (HTTP ${res.status})`);
  return (await res.json()) as OverridesResponse;
}

async function fetchOwnerDetails(ownerId: string): Promise<OwnerDetails> {
  const url = new URL("/api/manager/portal/user-details", window.location.origin);
  url.searchParams.set("ownerId", ownerId);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof body?.error === "string" && body.error ? body.error : `Failed to load details (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body as OwnerDetails;
}

function formatIso(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString();
}

function formatHours(seconds: number | null | undefined) {
  const s = typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hrs = s / 3600;
  return hrs >= 10 ? `${Math.round(hrs)}h` : `${hrs.toFixed(1)}h`;
}

function formatDurationShort(secondsRaw: number | null | undefined) {
  const seconds = typeof secondsRaw === "number" && Number.isFinite(secondsRaw) ? Math.max(0, Math.floor(secondsRaw)) : 0;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
}

function portalDiagnosticKindLabel(kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure") {
  if (kind === "action_failure") return "Action";
  if (kind === "runtime_error") return "Runtime";
  if (kind === "unhandled_rejection") return "Promise";
  return "Resource";
}

function portalDiagnosticKindClassName(kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure") {
  if (kind === "action_failure") return "bg-amber-100 text-amber-900";
  if (kind === "runtime_error") return "bg-red-100 text-red-900";
  if (kind === "unhandled_rejection") return "bg-orange-100 text-orange-900";
  return "bg-sky-100 text-sky-900";
}

function portalDiagnosticViewEnvironmentLabel(value: string | null | undefined) {
  if (value === "local") return "Local / dev";
  if (value === "preview") return "Preview";
  if (value === "production") return "Production";
  return "Unknown";
}

function portalDiagnosticViewSurfaceLabel(value: string | null | undefined) {
  if (value === "admin_portal") return "Admin portal";
  if (value === "hosted_funnel") return "Hosted funnel";
  if (value === "public_site") return "Public site";
  return "Unknown";
}

function portalDiagnosticViewAudienceLabel(value: string | null | undefined) {
  if (value === "internal_operator") return "Internal operator";
  if (value === "customer_surface") return "Customer-facing";
  return "Unknown";
}

function humanizePortalDiagnosticAction(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown action";
  return raw.replace(/_/g, " ");
}

function groupRecentActivity(
  activity: Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }>,
  opts?: { maxGapMs?: number; take?: number },
) {
  const maxGapMs = Math.max(0, Math.floor(opts?.maxGapMs ?? 2500));
  const take = Math.max(1, Math.floor(opts?.take ?? 200));

  const normalized = activity
    .map((a) => {
      const endMs = Math.max(0, Math.floor(a.atMs));
      const dtSec = Math.max(1, Math.min(60, Math.floor(a.dtSec)));
      const startMs = Math.max(0, endMs - dtSec * 1000);
      const key = (a.pageKey || a.path || "").trim().slice(0, 512);
      return { key, path: a.path, pageKey: a.pageKey, startMs, endMs };
    })
    .filter((a) => Boolean(a.key) && a.endMs > 0)
    .sort((a, b) => a.startMs - b.startMs);

  const sessions: Array<{ key: string; startMs: number; endMs: number; seconds: number }> = [];
  for (const a of normalized) {
    const prev = sessions.length ? sessions[sessions.length - 1] : null;
    if (prev && prev.key === a.key && a.startMs <= prev.endMs + maxGapMs) {
      prev.endMs = Math.max(prev.endMs, a.endMs);
      prev.seconds = Math.max(1, Math.floor((prev.endMs - prev.startMs) / 1000));
      continue;
    }
    sessions.push({ key: a.key, startMs: a.startMs, endMs: a.endMs, seconds: Math.max(1, Math.floor((a.endMs - a.startMs) / 1000)) });
  }

  sessions.sort((a, b) => b.endMs - a.endMs);
  return sessions.slice(0, take);
}

function ColorSwatch({ hex }: { hex: string | null | undefined }) {
  const h = String(hex || "").trim();
  const ok = /^#?[0-9a-fA-F]{3,8}$/.test(h);
  const css = ok ? (h.startsWith("#") ? h : `#${h}`) : "#e4e4e7";
  return <span className="inline-flex h-3 w-3 rounded-full border border-zinc-200" style={{ backgroundColor: css }} />;
}

function UserRowSkeleton() {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="animate-pulse space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-zinc-200" />
            <div className="h-3 w-64 rounded bg-zinc-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-24 rounded-2xl bg-zinc-100" />
            <div className="h-10 w-24 rounded-2xl bg-zinc-100" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-2xl bg-zinc-100" />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="h-28 rounded-2xl bg-zinc-100" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-16 rounded-2xl bg-zinc-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function setOverride(opts: { ownerId: string; module: ModuleKey; enabled: boolean }) {
  const res = await fetch("/api/manager/portal/overrides", {
    method: opts.enabled ? "POST" : "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerId: opts.ownerId, module: opts.module }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (HTTP ${res.status})`);
  }
}

async function giftCredits(opts: { ownerId: string; amount: number }) {
  const res = await fetch("/api/manager/portal/credits/gift", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerId: opts.ownerId, amount: opts.amount }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body as { ok: true; balance: number };
}

async function setCreditsOnlyOverride(opts: { ownerIds: string[]; creditsOnly: boolean }) {
  const res = await fetch("/api/manager/portal/billing-model", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerIds: opts.ownerIds, creditsOnly: opts.creditsOnly }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body as { ok: true; creditsOnly: boolean };
}

async function deletePortalUser(ownerId: string) {
  const res = await fetch(`/api/manager/portal/users/${encodeURIComponent(ownerId)}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body as { ok: true };
}

async function seedCreditDemo(opts: { email: string; force?: boolean }) {
  const res = await fetch("/api/manager/portal/seed-credit-demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: opts.email, force: opts.force === true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = typeof body?.details === "string" && body.details ? ` ${body.details}` : "";
    const msg = typeof body?.error === "string" && body.error ? `${body.error}${details}` : `Request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body as { ok: true; skipped?: boolean; forced?: boolean; email?: string };
}

export default function PortalOverridesClient() {
  const toast = useToast();

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [giftingOwnerId, setGiftingOwnerId] = useState<string | null>(null);
  const [giftAmountByOwner, setGiftAmountByOwner] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);

  const [testingOwnerId, setTestingOwnerId] = useState<string | null>(null);

  const [detailsOwnerId, setDetailsOwnerId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsByOwnerId, setDetailsByOwnerId] = useState<Record<string, OwnerDetails>>({});
  const [detailsTab, setDetailsTab] = useState<"account" | "diagnostics">("account");
  const [creditSeedingOwnerId, setCreditSeedingOwnerId] = useState<string | null>(null);

  const testingUser = useMemo(() => {
    const id = (testingOwnerId || "").trim();
    if (!id) return null;
    return users.find((u) => u.id === id) ?? null;
  }, [testingOwnerId, users]);

  const details = useMemo(() => {
    const id = (detailsOwnerId || "").trim();
    if (!id) return null;
    return detailsByOwnerId[id] ?? null;
  }, [detailsByOwnerId, detailsOwnerId]);

  useEffect(() => {
    if (!detailsOwnerId) return;
    setDetailsTab("account");
  }, [detailsOwnerId]);

  const testingAiReceptionistAgentId =
    testingUser?.voiceAgentIds?.aiReceptionist ?? testingUser?.voiceAgentIds?.profile ?? null;
  const testingOutboundAgentId = testingUser?.voiceAgentIds?.profile ?? null;

  const moduleList = useMemo(() => MODULE_KEYS, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchOverrides(q);
        if (cancelled) return;
        setUsers(json.users);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load overrides");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  async function reloadOverrides() {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchOverrides(q);
      setUsers(json.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overrides");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const ownerId = (detailsOwnerId || "").trim();
    if (!ownerId) return;
    if (detailsByOwnerId[ownerId]) return;

    setDetailsLoading(true);
    setDetailsError(null);
    void (async () => {
      try {
        const json = await fetchOwnerDetails(ownerId);
        if (cancelled) return;
        setDetailsByOwnerId((prev) => ({ ...prev, [ownerId]: json }));
      } catch (e) {
        if (cancelled) return;
        setDetailsError(e instanceof Error ? e.message : "Failed to load details");
      } finally {
        if (cancelled) return;
        setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailsOwnerId, detailsByOwnerId]);

  async function toggle(ownerId: string, module: ModuleKey, enabled: boolean) {
    const key = `${ownerId}:${module}`;
    setSavingKey(key);
    try {
      await setOverride({ ownerId, module, enabled });
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== ownerId) return u;
          const set = new Set(u.overrides);
          if (enabled) set.add(module);
          else set.delete(module);
          return { ...u, overrides: Array.from(set) };
        }),
      );
      toast.success(enabled ? `Enabled ${MODULE_LABELS[module]}` : `Disabled ${MODULE_LABELS[module]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function onGift(ownerId: string) {
    const raw = (giftAmountByOwner[ownerId] ?? "").trim();
    const amount = Number(raw);
    if (!Number.isFinite(amount) || Math.floor(amount) !== amount || amount <= 0) {
      toast.error("Enter a positive whole number of credits");
      return;
    }

    setGiftingOwnerId(ownerId);
    try {
      const res = await giftCredits({ ownerId, amount });
      setUsers((prev) => prev.map((u) => (u.id === ownerId ? { ...u, creditsBalance: res.balance } : u)));
      toast.success(`Gifted ${amount} credits`);
      setGiftAmountByOwner((prev) => ({ ...prev, [ownerId]: "" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gift failed");
    } finally {
      setGiftingOwnerId(null);
    }
  }

  async function toggleCreditsOnly(ownerId: string, creditsOnly: boolean) {
    const key = `billingModel:${ownerId}`;
    setSavingKey(key);
    try {
      await setCreditsOnlyOverride({ ownerIds: [ownerId], creditsOnly });
      setUsers((prev) => prev.map((u) => (u.id === ownerId ? { ...u, creditsOnlyOverride: creditsOnly } : u)));
      toast.success(creditsOnly ? "Credits-only enabled" : "Credits-only cleared (env default)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function bulkSetCreditsOnly(creditsOnly: boolean) {
    const ownerIds = users.map((u) => u.id);
    if (!ownerIds.length) return;
    const confirmText = creditsOnly
      ? `Enable credits-only billing for ${ownerIds.length} user(s)?`
      : `Clear credits-only override for ${ownerIds.length} user(s) (revert to env default)?`;
    if (!window.confirm(confirmText)) return;

    const key = `billingModel:bulk:${creditsOnly ? "on" : "off"}`;
    setSavingKey(key);
    try {
      await setCreditsOnlyOverride({ ownerIds, creditsOnly });
      setUsers((prev) => prev.map((u) => ({ ...u, creditsOnlyOverride: creditsOnly })));
      toast.success(creditsOnly ? "Credits-only enabled for all shown users" : "Credits-only cleared for all shown users");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function onSeedCreditDemo(ownerId: string) {
    const row = users.find((user) => user.id === ownerId) ?? null;
    const email = String(row?.email || "").trim().toLowerCase();
    if (!email) {
      toast.error("This account is missing an email");
      return;
    }

    setCreditSeedingOwnerId(ownerId);
    try {
      const result = await seedCreditDemo({ email, force: true });
      toast.success(result.skipped ? `Credit demo already present for ${email}` : `Credit demo seeded for ${email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to seed credit demo");
    } finally {
      setCreditSeedingOwnerId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-zinc-50/80 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="flex-1">
          <label className="text-sm font-semibold text-zinc-700">Search portal users</label>
          <input
            className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Email or name…"
          />
        </div>
        <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Visible accounts</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">{loading && users.length === 0 ? "Loading…" : users.length}</div>
          <div className="text-xs text-zinc-500">{loading && users.length > 0 ? "Refreshing results" : `${users.length === 1 ? "user" : "users"} shown`}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-4 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5">
        <div className="text-zinc-700">
          Credits-only billing override (affects <span className="font-mono">/portal</span>):
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            onClick={() => void bulkSetCreditsOnly(true)}
            disabled={savingKey === "billingModel:bulk:on" || loading || users.length === 0}
          >
            {savingKey === "billingModel:bulk:on" ? "Enabling…" : "Enable for all shown"}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            onClick={() => void bulkSetCreditsOnly(false)}
            disabled={savingKey === "billingModel:bulk:off" || loading || users.length === 0}
          >
            {savingKey === "billingModel:bulk:off" ? "Clearing…" : "Clear for all shown"}
          </button>
          <div className="text-xs text-zinc-500">
            When cleared, the portal uses env defaults.
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {loading && users.length === 0 ? (
          <>
            <UserRowSkeleton />
            <UserRowSkeleton />
            <UserRowSkeleton />
          </>
        ) : null}

        {users.map((u) => (
          <div key={u.id} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-brand-ink break-all">{u.businessName || u.name || u.email}</div>
                      {u.deletedAt ? (
                        <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Deleted</span>
                      ) : u.active ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">Inactive</span>
                      )}
                    </div>
                    <div className="mt-1 break-all text-sm text-zinc-600">{u.email}</div>
                    {u.deletedAt ? <div className="mt-1 text-xs text-zinc-500">Removed {formatIso(u.deletedAt)}</div> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => setDetailsOwnerId(u.id)}
                    >
                      Open details
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => setTestingOwnerId(u.id)}
                    >
                      Testing
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Mailbox</div>
                    <div className="mt-2 break-all text-sm font-medium text-zinc-900">{u.businessEmail || "Not set"}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Phone</div>
                    <div className="mt-2 break-all text-sm font-medium text-zinc-900">{u.phone || "Not set"}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Invites</div>
                    <div className="mt-2 text-sm font-medium text-zinc-900">
                      {Math.max(0, u.invitesSentCount ?? 0)} sent
                      <span className="text-zinc-500"> · {Math.max(0, u.invitesVerifiedCount ?? 0)} verified · {Math.max(0, u.inviteCreditsAwardedCount ?? 0)} awarded</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Twilio</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-900">
                      <span
                        className={
                          u.twilio?.configured
                            ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                            : "inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600"
                        }
                      >
                        {u.twilio?.configured ? "Configured" : "Not configured"}
                      </span>
                      {u.twilio?.configured && u.twilio.fromNumberE164 ? <span className="font-mono break-all text-xs text-zinc-700">{u.twilio.fromNumberE164}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Credits balance</div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{Math.max(0, Math.floor(u.creditsBalance ?? 0))}</div>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
                    {u.creditsOnlyOverride ? "Credits-only on" : "Env default"}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1">
                  <input
                    className="min-h-11 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    placeholder="Gift amount"
                    inputMode="numeric"
                    value={giftAmountByOwner[u.id] ?? ""}
                    onChange={(e) => setGiftAmountByOwner((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    disabled={giftingOwnerId === u.id}
                  />
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    onClick={() => void onGift(u.id)}
                    disabled={giftingOwnerId === u.id}
                  >
                    {giftingOwnerId === u.id ? "Gifting…" : "Gift credits"}
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Credits-only billing</div>
                    <div className="text-xs text-zinc-500">Off uses env defaults.</div>
                  </div>
                  {(() => {
                    const enabled = Boolean(u.creditsOnlyOverride);
                    const key = `billingModel:${u.id}`;
                    const busy = savingKey === key;
                    return (
                      <div className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <ToggleSwitch
                          checked={enabled}
                          disabled={busy}
                          accent="ink"
                          ariaLabel="Credits-only billing override"
                          onChange={(checked) => void toggleCreditsOnly(u.id, checked)}
                        />
                        <span className={enabled ? "font-semibold text-emerald-700" : "text-zinc-500"}>{busy ? "Saving…" : enabled ? "On" : "Off"}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Service overrides</div>
                    <div className="text-xs text-zinc-500">Grant or remove access without horizontal scrolling.</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {moduleList.map((m) => {
                    const enabled = u.overrides.includes(m);
                    const key = `${u.id}:${m}`;
                    const busy = savingKey === key;
                    return (
                      <div key={m} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900">{MODULE_LABELS[m]}</div>
                          <div className="text-xs text-zinc-500">{busy ? "Saving change…" : enabled ? "Override enabled" : "Override off"}</div>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-2 text-sm text-zinc-700">
                          <ToggleSwitch
                            checked={enabled}
                            disabled={busy}
                            ariaLabel={`Toggle ${MODULE_LABELS[m]}`}
                            onChange={(checked) => toggle(u.id, m, checked)}
                          />
                          <span className={enabled ? "font-semibold text-emerald-700" : "text-zinc-500"}>{enabled ? "On" : "Off"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!loading && users.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white px-4 py-10 text-sm text-zinc-600 shadow-sm">
            No portal users found.
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Tip: Turning a module on here will unlock the matching service in `/portal` (and portal APIs) as if Stripe was paid.
      </div>

      {testingUser ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">AI testing</div>
                <div className="mt-1 truncate text-sm text-zinc-600">
                  {testingUser.businessName ? `${testingUser.businessName} · ` : ""}{testingUser.email}
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={() => setTestingOwnerId(null)}
              >
                Close
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">AI Receptionist widget</div>
                <div className="mt-1 text-xs text-zinc-500">Uses the account’s AI Receptionist voice agent ID (falls back to Profile if missing).</div>
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-600">
                    Voice agent ID: <span className="font-mono text-zinc-800">{testingAiReceptionistAgentId ?? "N/A"}</span>
                  </div>
                  <div className="mt-3">
                    <ElevenLabsConvaiWidget agentId={testingAiReceptionistAgentId} />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-900">AI Outbound widget</div>
                <div className="mt-1 text-xs text-zinc-500">Uses the account’s Profile voice agent ID.</div>
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-600">
                    Voice agent ID: <span className="font-mono text-zinc-800">{testingOutboundAgentId ?? "N/A"}</span>
                  </div>
                  <div className="mt-3">
                    <ElevenLabsConvaiWidget agentId={testingOutboundAgentId} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailsOwnerId ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onMouseDown={() => setDetailsOwnerId(null)}
        >
          <div
            className="flex w-full max-w-4xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Portal user details</div>
                <div className="mt-1 truncate text-sm text-zinc-600">
                  {(details?.owner.businessProfile?.businessName || users.find((x) => x.id === detailsOwnerId)?.businessName) ? (
                    <span>{details?.owner.businessProfile?.businessName || users.find((x) => x.id === detailsOwnerId)?.businessName} · </span>
                  ) : null}
                  {users.find((x) => x.id === detailsOwnerId)?.email ?? detailsOwnerId}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                  disabled={creditSeedingOwnerId === detailsOwnerId}
                  onClick={() => {
                    const ownerId = (detailsOwnerId || "").trim();
                    if (!ownerId) return;
                    void onSeedCreditDemo(ownerId);
                  }}
                >
                  {creditSeedingOwnerId === detailsOwnerId ? "Seeding credit…" : "Seed credit demo"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                  onClick={() => {
                    const ownerId = (detailsOwnerId || "").trim();
                    if (!ownerId) return;
                    const email = users.find((x) => x.id === ownerId)?.email || ownerId;
                    if (!confirm(`Delete this client portal account?\n\n${email}\n\nThis will disable the account and free the email so a new signup can use it again.`)) return;
                    void (async () => {
                      try {
                        await deletePortalUser(ownerId);
                        toast.success("Account deleted (email freed).");
                        setDetailsOwnerId(null);
                        setDetailsByOwnerId((prev) => {
                          const next = { ...prev };
                          delete next[ownerId];
                          return next;
                        });
                        await reloadOverrides();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Unable to delete account");
                      }
                    })();
                  }}
                >
                  Delete account
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  onClick={() => setDetailsOwnerId(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {detailsError ? (
                <div className="p-5">
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{detailsError}</div>
                </div>
              ) : null}

              {detailsLoading && !details ? (
                <div className="p-5">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">Loading details…</div>
                </div>
              ) : null}

              {details ? (
                <div className="p-5">
                <div className="mb-5 inline-flex w-full flex-wrap items-center gap-2 rounded-2xl bg-zinc-100/70 p-1">
                  {([
                    { key: "account" as const, label: "Account" },
                    { key: "diagnostics" as const, label: "Diagnostics" },
                  ] as const).map((item) => {
                    const active = detailsTab === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setDetailsTab(item.key)}
                        aria-current={active ? "page" : undefined}
                        className={
                          active
                            ? "inline-flex items-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-brand-ink ring-1 ring-zinc-200"
                            : "inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-white hover:text-zinc-900"
                        }
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {detailsTab === "account" ? (
                <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900">Business</div>
                    <div className="mt-2 space-y-1 text-sm text-zinc-700">
                      <div>
                        <span className="text-zinc-500">Owner:</span> <span className="font-semibold text-zinc-900">{details.owner.name}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Email:</span> <span className="font-mono text-zinc-900">{details.owner.email}</span>
                      </div>
                      {details.owner.portal.mailboxEmail ? (
                        <div>
                          <span className="text-zinc-500">Mailbox:</span>{" "}
                          <span className="font-mono text-zinc-900">{details.owner.portal.mailboxEmail}</span>
                        </div>
                      ) : null}
                      {details.owner.portal.phone ? (
                        <div>
                          <span className="text-zinc-500">Phone:</span> <span className="font-mono text-zinc-900">{details.owner.portal.phone}</span>
                        </div>
                      ) : null}
                      {details.owner.businessProfile?.websiteUrl ? (
                        <div className="truncate">
                          <span className="text-zinc-500">Website:</span>{" "}
                          <a
                            href={details.owner.businessProfile.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-brand-ink hover:underline"
                          >
                            {details.owner.businessProfile.websiteUrl}
                          </a>
                        </div>
                      ) : null}
                      {details.owner.businessProfile?.industry ? (
                        <div>
                          <span className="text-zinc-500">Industry:</span> {details.owner.businessProfile.industry}
                        </div>
                      ) : null}
                      {details.owner.businessProfile?.businessModel ? (
                        <div>
                          <span className="text-zinc-500">Model:</span> {details.owner.businessProfile.businessModel}
                        </div>
                      ) : null}
                      {details.owner.businessProfile?.targetCustomer ? (
                        <div>
                          <span className="text-zinc-500">Target:</span> {details.owner.businessProfile.targetCustomer}
                        </div>
                      ) : null}
                      {details.owner.businessProfile?.brandVoice ? (
                        <div>
                          <span className="text-zinc-500">Voice:</span> {details.owner.businessProfile.brandVoice}
                        </div>
                      ) : null}
                      <div className="pt-2 text-xs text-zinc-500">
                        Created {formatIso(details.owner.createdAt)} · Last updated {formatIso(details.owner.updatedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-sm font-semibold text-zinc-900">Branding</div>
                    <div className="mt-2 space-y-2 text-sm text-zinc-700">
                      {details.owner.businessProfile?.logoUrl ? (
                        <div className="truncate">
                          <span className="text-zinc-500">Logo:</span>{" "}
                          <a href={details.owner.businessProfile.logoUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">
                            {details.owner.businessProfile.logoUrl}
                          </a>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2">
                          <ColorSwatch hex={details.owner.businessProfile?.brandPrimaryHex} />
                          <span className="text-xs text-zinc-500">Primary</span>
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <ColorSwatch hex={details.owner.businessProfile?.brandAccentHex} />
                          <span className="text-xs text-zinc-500">Accent</span>
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <ColorSwatch hex={details.owner.businessProfile?.brandTextHex} />
                          <span className="text-xs text-zinc-500">Text</span>
                        </span>
                      </div>
                      {details.owner.businessProfile?.brandFontFamily ? (
                        <div>
                          <span className="text-zinc-500">Font:</span> {details.owner.businessProfile.brandFontFamily}
                        </div>
                      ) : null}
                      {details.owner.businessProfile?.brandFontGoogleFamily ? (
                        <div>
                          <span className="text-zinc-500">Google font:</span> {details.owner.businessProfile.brandFontGoogleFamily}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900">Integrations</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={
                          details.owner.integrations.twilio.configured
                            ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                            : "inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600"
                        }
                      >
                        Twilio: {details.owner.integrations.twilio.configured ? "On" : "Off"}
                      </span>
                      {details.owner.integrations.twilio.configured && details.owner.integrations.twilio.fromNumberE164 ? (
                        <span className="font-mono text-zinc-700">{details.owner.integrations.twilio.fromNumberE164}</span>
                      ) : null}
                      {(() => {
                        const on = Boolean(details.owner.stripe.connected || details.owner.integrations.salesReporting.connectedProviders.length);
                        return (
                          <span
                            className={
                              on
                                ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                                : "inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600"
                            }
                          >
                            Sales reporting: {on ? "On" : "Off"}
                          </span>
                        );
                      })()}
                      <span
                        className={
                          details.owner.stripe.connected
                            ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                            : "inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600"
                        }
                      >
                        Stripe: {details.owner.stripe.connected ? "Connected" : "Off"}
                      </span>
                    </div>

                    {details.owner.integrations.salesReporting.connectedProviders.length ? (
                      <div className="mt-3 space-y-1 text-xs text-zinc-600">
                        {details.owner.integrations.salesReporting.connectedProviders.slice(0, 5).map((p) => (
                          <div key={p.provider} className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-zinc-800">{p.provider}</span>
                            <span className="truncate font-mono text-zinc-700">{p.displayHint ?? ""}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-sm font-semibold text-zinc-900">Portal status</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-zinc-700">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credits</div>
                        <div className="mt-1 font-semibold text-zinc-900">{Math.max(0, Math.floor(details.owner.portal.creditsBalance ?? 0))}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credits-only</div>
                        <div className="mt-1 font-semibold text-zinc-900">{details.owner.portal.creditsOnlyOverride ? "On" : "Off"}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Overrides</div>
                        <div className="mt-1 text-xs text-zinc-700">
                          {details.owner.portal.overrides.length ? details.owner.portal.overrides.map((m) => MODULE_LABELS[m]).join(" · ") : "None"}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI agent IDs</div>
                        <div className="mt-1 space-y-1 text-xs text-zinc-700">
                          <div>
                            Profile: <span className="font-mono text-zinc-900">{details.owner.ai.voiceAgentIds.profile ?? "N/A"}</span>
                          </div>
                          <div>
                            AI receptionist: <span className="font-mono text-zinc-900">{details.owner.ai.voiceAgentIds.aiReceptionist ?? "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900">Usage (last 30 days)</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-zinc-700">
                      <div>
                        <div className="text-xs text-zinc-500">Blog generations</div>
                        <div className="font-semibold text-zinc-900">{details.owner.usage.blog.generationEventsLast30}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Newsletter sends</div>
                        <div className="font-semibold text-zinc-900">{details.owner.usage.newsletter.sentLast30}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Newsletter failures</div>
                        <div className={details.owner.usage.newsletter.failedLast30 ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>
                          {details.owner.usage.newsletter.failedLast30}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Lead scrape runs</div>
                        <div className="font-semibold text-zinc-900">{details.owner.usage.leadScraping.runsLast30}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Lead scrape errors</div>
                        <div className={details.owner.usage.leadScraping.errorsLast30 ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>
                          {details.owner.usage.leadScraping.errorsLast30}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Bookings created</div>
                        <div className="font-semibold text-zinc-900">{details.owner.usage.booking.bookingsCreatedLast30}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Upcoming bookings</div>
                        <div className="font-semibold text-zinc-900">{details.owner.usage.booking.bookingsUpcoming}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Hours saved</div>
                        <div className="font-semibold text-zinc-900">{formatHours(details.owner.usage.hoursSaved.secondsLast30)}</div>
                      </div>

                      {details.owner.usage.portalEngagement?.topPages?.length ? (
                        <div className="col-span-2 pt-2 text-xs text-zinc-500">
                          Top pages: {details.owner.usage.portalEngagement.topPages.map((p) => `${p.key}=${formatDurationShort(p.seconds)}`).join(" · ")}
                        </div>
                      ) : (
                        <div className="col-span-2 pt-2 text-xs text-zinc-500">
                          Most used: {details.owner.usage.mostUsedServices.map((s) => `${s.key.replace(/Last30$/, "")}=${s.count}`).join(" · ")}
                        </div>
                      )}

                      <div className="col-span-2 text-xs text-zinc-500">
                        Last activity: {details.owner.usage.lastActivityAt ? formatIso(details.owner.usage.lastActivityAt) : "N/A"}
                      </div>
                    </div>
                  </div>

                  {details.owner.usage.portalEngagement?.recentActivity?.length ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="text-sm font-semibold text-zinc-900">All activity</div>
                      <div className="mt-1 text-xs text-zinc-500">Grouped into continuous sessions per page (capped).</div>
                      <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="grid gap-2">
                          {groupRecentActivity(details.owner.usage.portalEngagement.recentActivity, { take: 250 }).map((s, idx) => (
                            <div key={`${s.key}-${s.endMs}-${idx}`} className="flex items-start justify-between gap-3 text-xs text-zinc-700">
                              <div className="min-w-0">
                                <div className="truncate font-mono text-zinc-900" title={s.key}>
                                  {s.key}
                                </div>
                                <div className="mt-0.5 text-[11px] text-zinc-500">
                                  {new Date(s.startMs).toLocaleString()} → {new Date(s.endMs).toLocaleString()}
                                </div>
                              </div>
                              <div className="shrink-0 font-semibold text-zinc-700">{formatDurationShort(s.seconds)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {details.owner.usage.portalDiagnostics ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Portal diagnostics</div>
                          <div className="mt-1 text-xs text-zinc-500">Automatic app-side failures captured from the portal shell, plus manual bug reports.</div>
                        </div>
                        <div className="text-right text-xs text-zinc-500">
                          {details.owner.usage.portalDiagnostics.lastSeenAt ? formatIso(details.owner.usage.portalDiagnostics.lastSeenAt) : "No diagnostics yet"}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-700 md:grid-cols-5">
                        <div>
                          <div className="text-xs text-zinc-500">Action failures</div>
                          <div className={details.owner.usage.portalDiagnostics.actionFailureCount ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>
                            {details.owner.usage.portalDiagnostics.actionFailureCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Runtime errors</div>
                          <div className={details.owner.usage.portalDiagnostics.runtimeErrorCount ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>
                            {details.owner.usage.portalDiagnostics.runtimeErrorCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Unhandled rejections</div>
                          <div className={details.owner.usage.portalDiagnostics.unhandledRejectionCount ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>
                            {details.owner.usage.portalDiagnostics.unhandledRejectionCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Resource errors</div>
                          <div className={details.owner.usage.portalDiagnostics.resourceErrorCount ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>
                            {details.owner.usage.portalDiagnostics.resourceErrorCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">Manual bug reports</div>
                          <div className={details.owner.usage.portalDiagnostics.bugReports.count ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>
                            {details.owner.usage.portalDiagnostics.bugReports.count}
                          </div>
                        </div>
                      </div>

                      {details.owner.usage.portalDiagnostics.recentEvents.length ? (
                        <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="grid gap-2">
                            {details.owner.usage.portalDiagnostics.recentEvents.slice(0, 30).map((item) => (
                              <div key={item.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-zinc-900">
                                      {portalDiagnosticKindLabel(item.kind)}
                                      {item.count > 1 ? ` x${item.count}` : ""}
                                    </div>
                                    <div className="mt-1 wrap-break-word text-zinc-700">{item.message}</div>
                                    {item.path ? <div className="mt-1 font-mono text-[11px] text-zinc-500">{item.path}</div> : null}
                                    {item.file ? <div className="mt-1 font-mono text-[11px] text-zinc-400">{item.file}</div> : null}
                                  </div>
                                  <div className="shrink-0 text-right text-[11px] text-zinc-500">
                                    <div>{formatIso(item.lastSeenAtIso || item.createdAtIso)}</div>
                                    {item.source ? <div className="mt-1 uppercase tracking-wide">{item.source}</div> : null}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
                          No automatic client failures have been recorded for this owner yet.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {details.hostedLinks ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-sm font-semibold text-zinc-900">Hosted links</div>
                      <div className="mt-3 space-y-2 text-sm">
                        {details.hostedLinks.funnels.length ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Funnels</div>
                            <div className="mt-1 space-y-1">
                              {details.hostedLinks.funnels.slice(0, 10).map((f) => (
                                <div key={f.slug} className="rounded-xl border border-zinc-200 bg-white p-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <a href={f.url} target="_blank" rel="noreferrer" className="truncate font-semibold text-brand-ink hover:underline">{f.name}</a>
                                    <span className="text-xs font-mono text-zinc-600">/f/{f.slug}</span>
                                  </div>
                                  {f.pages.length ? (
                                    <div className="mt-2 space-y-1">
                                      {f.pages.slice(0, 5).map((p) => (
                                        <div key={p.slug} className="flex items-center justify-between gap-3">
                                          <a href={p.url} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-brand-ink hover:underline">{p.title}</a>
                                          <span className="text-xs font-mono text-zinc-600">/{p.slug}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {details.hostedLinks.blog ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Blog</div>
                            <div className="mt-1">
                              <a href={details.hostedLinks.blog.indexUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">Blog index</a>
                            </div>
                            {details.hostedLinks.blog.posts.length ? (
                              <div className="mt-2 space-y-1">
                                {details.hostedLinks.blog.posts.slice(0, 5).map((p) => (
                                  <div key={p.slug} className="flex items-center justify-between gap-3">
                                    <a href={p.url} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-brand-ink hover:underline">{p.title}</a>
                                    <span className="text-xs font-mono text-zinc-600">/blogs/{p.slug}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {details.hostedLinks.newsletters ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Newsletters</div>
                            <div className="mt-1">
                              <a href={details.hostedLinks.newsletters.indexUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">Newsletters index</a>
                            </div>
                            {details.hostedLinks.newsletters.items.length ? (
                              <div className="mt-2 space-y-1">
                                {details.hostedLinks.newsletters.items.slice(0, 5).map((n) => (
                                  <div key={n.slug} className="flex items-center justify-between gap-3">
                                    <a href={n.url} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-brand-ink hover:underline">{n.title}</a>
                                    <span className="text-xs font-mono text-zinc-600">/newsletters/{n.slug}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {details.hostedLinks.reviews ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Reviews</div>
                            <div className="mt-1">
                              <a href={details.hostedLinks.reviews.indexUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">Reviews page</a>
                            </div>
                          </div>
                        ) : null}

                        {details.hostedLinks.booking ? (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Booking</div>
                            <div className="mt-1">
                              <a href={details.hostedLinks.booking.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">Booking page</a>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                </div>
                ) : (
                <div className="space-y-4">
                  {details.owner.usage.portalDiagnostics ? (
                    <>
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">Diagnostics overview</div>
                            <div className="mt-1 text-sm text-zinc-600">Manager-side failure view for this account, with local/dev operator activity separated from customer-facing traffic.</div>
                          </div>
                          <div className="text-right text-xs text-zinc-500">
                            {details.owner.usage.portalDiagnostics.lastSeenAt ? formatIso(details.owner.usage.portalDiagnostics.lastSeenAt) : "No diagnostics yet"}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Action failures</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.actionFailureCount}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Runtime errors</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.runtimeErrorCount}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Promise failures</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.unhandledRejectionCount}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Resource failures</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.resourceErrorCount}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Bug reports</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.bugReports.count}</div></div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Local / dev operator</div><div className="mt-1 text-base font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.segments.localOperator}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Preview operator</div><div className="mt-1 text-base font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.segments.previewOperator}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Production operator</div><div className="mt-1 text-base font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.segments.productionOperator}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Customer-facing</div><div className="mt-1 text-base font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.segments.customerFacing}</div></div>
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Unknown</div><div className="mt-1 text-base font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.segments.unknown}</div></div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Top failing actions</div>
                          <div className="mt-3 space-y-2">
                            {details.owner.usage.portalDiagnostics.topActions.length ? details.owner.usage.portalDiagnostics.topActions.map((item) => (
                              <div key={`${item.area}:${item.action}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                                <div className="min-w-0"><div className="truncate text-sm font-semibold text-brand-ink">{humanizePortalDiagnosticAction(item.action)}</div><div className="mt-0.5 text-xs text-zinc-500">{item.area.replace(/_/g, " ")}</div></div>
                                <div className="shrink-0 text-sm font-semibold text-zinc-900">{item.count}</div>
                              </div>
                            )) : <div className="text-sm text-zinc-600">No explicit action failures recorded yet.</div>}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Context mix</div>
                          <div className="mt-3 space-y-3 text-xs text-zinc-700">
                            <div><div className="font-semibold text-zinc-600">Environment</div><div className="mt-2 flex flex-wrap gap-2">{details.owner.usage.portalDiagnostics.contexts.environments.map((item) => <span key={`env:${item.key}`} className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold">{item.label}: {item.count}</span>)}</div></div>
                            <div><div className="font-semibold text-zinc-600">Surface</div><div className="mt-2 flex flex-wrap gap-2">{details.owner.usage.portalDiagnostics.contexts.surfaces.map((item) => <span key={`surface:${item.key}`} className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold">{item.label}: {item.count}</span>)}</div></div>
                            <div><div className="font-semibold text-zinc-600">Audience</div><div className="mt-2 flex flex-wrap gap-2">{details.owner.usage.portalDiagnostics.contexts.audiences.map((item) => <span key={`aud:${item.key}`} className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold">{item.label}: {item.count}</span>)}</div></div>
                            <div><div className="font-semibold text-zinc-600">Hosts</div><div className="mt-2 space-y-2">{details.owner.usage.portalDiagnostics.contexts.hosts.length ? details.owner.usage.portalDiagnostics.contexts.hosts.map((item) => <div key={`host:${item.key}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2"><div className="min-w-0 truncate font-mono text-[11px]">{item.label}</div><div className="shrink-0 font-semibold">{item.count}</div></div>) : <div className="text-sm text-zinc-500">No host data yet.</div>}</div></div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Top paths</div>
                          <div className="mt-3 space-y-2">{details.owner.usage.portalDiagnostics.topPaths.length ? details.owner.usage.portalDiagnostics.topPaths.map((item) => <div key={item.path} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2"><div className="min-w-0 truncate font-mono text-[11px] text-zinc-700">{item.path}</div><div className="shrink-0 text-sm font-semibold text-zinc-900">{item.count}</div></div>) : <div className="text-sm text-zinc-600">No repeated paths are standing out yet.</div>}</div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Manual bug reports</div>
                          <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="text-xs text-zinc-500">Reports in storage</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.bugReports.count}</div><div className="mt-1 text-xs text-zinc-500">{details.owner.usage.portalDiagnostics.bugReports.lastReportedAt ? `Last report: ${formatIso(details.owner.usage.portalDiagnostics.bugReports.lastReportedAt)}` : "No bug reports recorded yet."}</div></div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Recent diagnostics</div>
                        {details.owner.usage.portalDiagnostics.recentEvents.length ? (
                          <div className="mt-3 space-y-3">{details.owner.usage.portalDiagnostics.recentEvents.slice(0, 40).map((item) => (
                            <div key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-2.5 py-1 font-semibold ${portalDiagnosticKindClassName(item.kind)}`}>{portalDiagnosticKindLabel(item.kind)}</span>
                                    {item.area ? <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-zinc-700">{item.area.replace(/_/g, " ")}</span> : null}
                                    {item.action ? <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-zinc-700">{humanizePortalDiagnosticAction(item.action)}</span> : null}
                                    {typeof item.status === "number" ? <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-zinc-700">HTTP {item.status}</span> : null}
                                  </div>
                                  <div className="mt-2 text-sm font-semibold text-zinc-900">{item.message}</div>
                                </div>
                                <div className="shrink-0 text-right text-[11px] text-zinc-500">{formatIso(item.lastSeenAtIso || item.createdAtIso)}{item.count > 1 ? ` · x${item.count}` : ""}</div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-white px-2.5 py-1 font-semibold text-zinc-700">{portalDiagnosticViewEnvironmentLabel(item.viewEnvironment)}</span><span className="rounded-full bg-white px-2.5 py-1 font-semibold text-zinc-700">{portalDiagnosticViewSurfaceLabel(item.viewSurface)}</span><span className="rounded-full bg-white px-2.5 py-1 font-semibold text-zinc-700">{portalDiagnosticViewAudienceLabel(item.viewAudience)}</span>{item.viewHost ? <span className="rounded-full bg-white px-2.5 py-1 font-mono font-semibold text-zinc-700">{item.viewHost}</span> : null}</div>
                              {item.path ? <div className="mt-2 font-mono text-[11px] text-zinc-500">{item.path}</div> : null}
                              {item.file ? <div className="mt-1 font-mono text-[11px] text-zinc-400">{item.file}</div> : null}
                            </div>
                          ))}</div>
                        ) : (
                          <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">No automatic client failures have been recorded for this owner yet.</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">Diagnostics are not available for this account yet.</div>
                  )}
                </div>
                )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
