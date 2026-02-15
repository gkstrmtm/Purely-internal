"use client";

import { useEffect, useMemo, useState } from "react";

type InviteRow = {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  createdBy?: { id: string; email: string; name: string };
  usedBy?: { id: string; email: string; name: string } | null;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function ManagerInvitesClient() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<number>(30);

  async function load() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/manager/invites", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));

    if (!res.ok || !body?.ok) {
      setLoading(false);
      setError([body?.error ?? "Failed to load invites", body?.details].filter(Boolean).join(" • "));
      return;
    }

    const normalized: InviteRow[] = (body.invites ?? []).map((i: any) => ({
      ...i,
      createdAt: typeof i.createdAt === "string" ? i.createdAt : new Date(i.createdAt).toISOString(),
      expiresAt: i.expiresAt ? (typeof i.expiresAt === "string" ? i.expiresAt : new Date(i.expiresAt).toISOString()) : null,
      usedAt: i.usedAt ? (typeof i.usedAt === "string" ? i.usedAt : new Date(i.usedAt).toISOString()) : null,
    }));

    setInvites(normalized);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate() {
    setCreating(true);
    setError(null);

    const res = await fetch("/api/manager/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresInDays }),
    });

    const body = await res.json().catch(() => ({}));
    setCreating(false);

    if (!res.ok || !body?.ok) {
      setError([body?.error ?? "Failed to create invite", body?.details].filter(Boolean).join(" • "));
      return;
    }

    await load();

    const code = body?.invite?.code;
    if (typeof code === "string") {
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // ignore
      }
    }
  }

  const signupUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin + "/signup";
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-brand-mist p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-base font-semibold text-brand-ink">Create a new invite</div>
            <div className="mt-1 text-sm text-zinc-600">
              New employees sign up at <span className="font-medium text-brand-ink">{signupUrl || "/signup"}</span>.
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div>
              <label className="text-sm font-semibold text-zinc-700">Expires in</label>
              <select
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>365 days</option>
              </select>
            </div>

            <button
              type="button"
              onClick={onCreate}
              disabled={creating}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 sm:mt-0"
            >
              {creating ? "Creating…" : "Create invite"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold text-brand-ink">Recent invites</div>
            <div className="mt-1 text-sm text-zinc-600">Codes are one-time use.</div>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 px-3 py-2">Code</th>
                <th className="border-b border-zinc-200 px-3 py-2">Created</th>
                <th className="border-b border-zinc-200 px-3 py-2">Expires</th>
                <th className="border-b border-zinc-200 px-3 py-2">Used</th>
                <th className="border-b border-zinc-200 px-3 py-2">Used by</th>
                <th className="border-b border-zinc-200 px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="text-sm text-zinc-700">
                  <td className="border-b border-zinc-100 px-3 py-3 font-mono text-xs text-zinc-900">{i.code}</td>
                  <td className="border-b border-zinc-100 px-3 py-3">{fmtDate(i.createdAt)}</td>
                  <td className="border-b border-zinc-100 px-3 py-3">{fmtDate(i.expiresAt)}</td>
                  <td className="border-b border-zinc-100 px-3 py-3">{fmtDate(i.usedAt)}</td>
                  <td className="border-b border-zinc-100 px-3 py-3">{i.usedBy?.email ?? "—"}</td>
                  <td className="border-b border-zinc-100 px-3 py-3">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(i.code);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              ))}
              {invites.length === 0 && !loading ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-zinc-500" colSpan={6}>
                    No invites yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
