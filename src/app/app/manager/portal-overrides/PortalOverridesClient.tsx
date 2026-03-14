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
      newsletter: { failedLast30: number; sentLast30: number; requestedLast30: number; sendEventsLast30: number };
      leadScraping: { runsLast30: number; createdLast30: number; chargedCreditsLast30: number; errorsLast30: number };
      booking: { site: { enabled: boolean; slug: string; title: string } | null; bookingsCreatedLast30: number; bookingsUpcoming: number };
      hoursSaved: { secondsLast30: number; eventsLast30: number };
      reviews: { receivedLast30: number };
      blog: { generationEventsLast30: number };
    };
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

function ColorSwatch({ hex }: { hex: string | null | undefined }) {
  const h = String(hex || "").trim();
  const ok = /^#?[0-9a-fA-F]{3,8}$/.test(h);
  const css = ok ? (h.startsWith("#") ? h : `#${h}`) : "#e4e4e7";
  return <span className="inline-flex h-3 w-3 rounded-full border border-zinc-200" style={{ backgroundColor: css }} />;
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

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <label className="text-sm font-semibold text-zinc-700">Search portal users</label>
          <input
            className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Email or name…"
          />
        </div>
        <div className="text-sm text-zinc-600 sm:self-end">
          {loading ? "Loading…" : `${users.length} user${users.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="text-zinc-700">
          Credits-only billing override (affects <span className="font-mono">/portal</span>):
        </div>
        <button
          type="button"
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          onClick={() => void bulkSetCreditsOnly(true)}
          disabled={savingKey === "billingModel:bulk:on" || loading || users.length === 0}
        >
          {savingKey === "billingModel:bulk:on" ? "Enabling…" : "Enable for all shown"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          onClick={() => void bulkSetCreditsOnly(false)}
          disabled={savingKey === "billingModel:bulk:off" || loading || users.length === 0}
        >
          {savingKey === "billingModel:bulk:off" ? "Clearing…" : "Clear for all shown"}
        </button>
        <div className="text-xs text-zinc-500">
          When cleared, the portal uses env defaults.
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-3xl border border-zinc-200">
        <table className="min-w-225 w-full border-separate border-spacing-0 bg-white">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="sticky left-0 z-10 bg-white px-4 py-3">User</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Credits-only</th>
              {moduleList.map((m) => (
                <th key={m} className="px-4 py-3">
                  {MODULE_LABELS[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                onClick={() => setDetailsOwnerId(u.id)}
              >
                <td className="sticky left-0 z-10 bg-white px-4 py-4">
                  <div className="text-sm font-semibold text-brand-ink">{u.email}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {u.name} {u.active ? "" : "• inactive"}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    {u.businessName ? (
                      <div>
                        Business: <span className="font-semibold text-zinc-800">{u.businessName}</span>
                      </div>
                    ) : null}
                    {u.businessEmail ? (
                      <div>
                        Mailbox: <span className="font-mono text-zinc-800">{u.businessEmail}</span>
                      </div>
                    ) : null}
                    {u.phone ? (
                      <div>
                        Phone: <span className="font-mono text-zinc-800">{u.phone}</span>
                      </div>
                    ) : null}
                    <div>
                      Invites: <span className="font-semibold text-zinc-800">{Math.max(0, u.invitesSentCount ?? 0)}</span>
                      <span className="text-zinc-500">
                        {" "}· verified {Math.max(0, u.invitesVerifiedCount ?? 0)} · awarded {Math.max(0, u.inviteCreditsAwardedCount ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          u.twilio?.configured
                            ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                            : "inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600"
                        }
                      >
                        Twilio: {u.twilio?.configured ? "On" : "Off"}
                      </span>
                      {u.twilio?.configured && u.twilio.fromNumberE164 ? (
                        <span className="font-mono text-zinc-700">{u.twilio.fromNumberE164}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTestingOwnerId(u.id);
                      }}
                    >
                      Testing
                    </button>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm font-semibold text-zinc-900">{Math.max(0, Math.floor(u.creditsBalance ?? 0))}</div>
                  <div
                    className="mt-2 flex items-center gap-2"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <input
                      className="w-28 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                      placeholder="Amount"
                      inputMode="numeric"
                      value={giftAmountByOwner[u.id] ?? ""}
                      onChange={(e) => setGiftAmountByOwner((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      disabled={giftingOwnerId === u.id}
                    />
                    <button
                      type="button"
                      className="rounded-xl bg-(--color-brand-blue) px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => onGift(u.id)}
                      disabled={giftingOwnerId === u.id}
                    >
                      {giftingOwnerId === u.id ? "Gifting…" : "Gift"}
                    </button>
                  </div>
                </td>

                <td className="px-4 py-4">
                  {(() => {
                    const enabled = Boolean(u.creditsOnlyOverride);
                    const key = `billingModel:${u.id}`;
                    const busy = savingKey === key;
                    return (
                      <div
                        className="inline-flex items-center gap-2 text-sm text-zinc-700"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <ToggleSwitch
                          checked={enabled}
                          disabled={busy}
                          accent="ink"
                          ariaLabel="Credits-only billing override"
                          onChange={(checked) => void toggleCreditsOnly(u.id, checked)}
                        />
                        <span className={enabled ? "font-semibold text-emerald-700" : "text-zinc-500"}>
                          {busy ? "Saving…" : enabled ? "On" : "Off"}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="mt-1 text-[11px] text-zinc-500">Off = env default</div>
                </td>

                {moduleList.map((m) => {
                  const enabled = u.overrides.includes(m);
                  const key = `${u.id}:${m}`;
                  const busy = savingKey === key;
                  return (
                    <td key={m} className="px-4 py-4">
                      <div
                        className="inline-flex items-center gap-2 text-sm text-zinc-700"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <ToggleSwitch
                          checked={enabled}
                          disabled={busy}
                          ariaLabel={`Toggle ${MODULE_LABELS[m]}`}
                          onChange={(checked) => toggle(u.id, m, checked)}
                        />
                        <span className={enabled ? "font-semibold text-emerald-700" : "text-zinc-500"}>
                          {busy ? "Saving…" : enabled ? "On" : "Off"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {!loading && users.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-sm text-zinc-600" colSpan={3 + moduleList.length}>
                  No portal users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
            className="w-full max-w-4xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl"
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
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={() => setDetailsOwnerId(null)}
              >
                Close
              </button>
            </div>

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
              <div className="grid gap-5 p-5 lg:grid-cols-2">
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
                      <span
                        className={
                          details.owner.integrations.salesReporting.connectedProviders.length
                            ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                            : "inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600"
                        }
                      >
                        Sales reporting: {details.owner.integrations.salesReporting.connectedProviders.length ? "On" : "Off"}
                      </span>
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
                      <div className="col-span-2 pt-2 text-xs text-zinc-500">
                        Most used: {details.owner.usage.mostUsedServices.map((s) => `${s.key.replace(/Last30$/, "")}=${s.count}`).join(" · ")}
                      </div>
                      <div className="col-span-2 text-xs text-zinc-500">
                        Last activity: {details.owner.usage.lastActivityAt ? formatIso(details.owner.usage.lastActivityAt) : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
