"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@/lib/entitlements.shared";

type UserRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: string;
  overrides: ModuleKey[];
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

export default function PortalOverridesClient() {
  const toast = useToast();

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);

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
    </div>
  );
}
