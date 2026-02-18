"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { ElevenLabsConvaiWidget } from "@/components/ElevenLabsConvaiWidget";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@/lib/entitlements.shared";

type UserRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: string;
  overrides: ModuleKey[];
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

async function fetchOverrides(q: string): Promise<OverridesResponse> {
  const url = new URL("/api/manager/portal/overrides", window.location.origin);
  if (q.trim()) url.searchParams.set("q", q.trim());
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load overrides (HTTP ${res.status})`);
  return (await res.json()) as OverridesResponse;
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

  const testingUser = useMemo(() => {
    const id = (testingOwnerId || "").trim();
    if (!id) return null;
    return users.find((u) => u.id === id) ?? null;
  }, [testingOwnerId, users]);

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

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-3xl border border-zinc-200">
        <table className="min-w-[900px] w-full border-separate border-spacing-0 bg-white">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="sticky left-0 z-10 bg-white px-4 py-3">User</th>
              <th className="px-4 py-3">Credits</th>
              {moduleList.map((m) => (
                <th key={m} className="px-4 py-3">
                  {MODULE_LABELS[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-100">
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
                      onClick={() => setTestingOwnerId(u.id)}
                    >
                      Testing
                    </button>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm font-semibold text-zinc-900">{Math.max(0, Math.floor(u.creditsBalance ?? 0))}</div>
                  <div className="mt-2 flex items-center gap-2">
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
                      className="rounded-xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => onGift(u.id)}
                      disabled={giftingOwnerId === u.id}
                    >
                      {giftingOwnerId === u.id ? "Gifting…" : "Gift"}
                    </button>
                  </div>
                </td>
                {moduleList.map((m) => {
                  const enabled = u.overrides.includes(m);
                  const key = `${u.id}:${m}`;
                  const busy = savingKey === key;
                  return (
                    <td key={m} className="px-4 py-4">
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-zinc-300"
                          checked={enabled}
                          disabled={busy}
                          onChange={(e) => toggle(u.id, m, e.target.checked)}
                        />
                        <span className={enabled ? "font-semibold text-emerald-700" : "text-zinc-500"}>
                          {enabled ? "On" : "Off"}
                        </span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}

            {!loading && users.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-sm text-zinc-600" colSpan={1 + moduleList.length}>
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
                <div className="mt-1 text-xs text-zinc-500">Uses the account’s AI Receptionist agent ID (falls back to Profile if missing).</div>
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-600">
                    Agent ID: <span className="font-mono text-zinc-800">{testingAiReceptionistAgentId ?? "N/A"}</span>
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
                    Agent ID: <span className="font-mono text-zinc-800">{testingOutboundAgentId ?? "N/A"}</span>
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
    </div>
  );
}
