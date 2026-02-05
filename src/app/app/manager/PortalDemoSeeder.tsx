"use client";

import { useState } from "react";

type SeedResult = {
  full: { email: string; password: string };
  limited: { email: string; password: string };
};

export default function PortalDemoSeeder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeedResult | null>(null);

  async function seed() {
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await fetch("/api/manager/portal/seed-demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setError(body?.error ?? "Unable to seed demo accounts");
      return;
    }

    const json = (await res.json()) as SeedResult;
    setResult(json);
    setLoading(false);
  }

  return (
    <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="text-base font-semibold text-brand-ink">Client portal demo accounts</div>
          <div className="mt-1 text-sm text-zinc-600">
            Creates two CLIENT logins (full-access + limited) for testing `/portal`.
          </div>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          onClick={seed}
          disabled={loading}
        >
          {loading ? "Seeding…" : "Seed demo accounts"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Full access</div>
            <div className="mt-2 text-xs text-zinc-600">Email</div>
            <div className="text-sm font-semibold text-brand-ink">{result.full.email}</div>
            <div className="mt-2 text-xs text-zinc-600">Password</div>
            <div className="text-sm font-semibold text-brand-ink">{result.full.password}</div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-semibold text-zinc-900">Limited access</div>
            <div className="mt-2 text-xs text-zinc-600">Email</div>
            <div className="text-sm font-semibold text-brand-ink">{result.limited.email}</div>
            <div className="mt-2 text-xs text-zinc-600">Password</div>
            <div className="text-sm font-semibold text-brand-ink">{result.limited.password}</div>
          </div>

          <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Go to <span className="font-semibold">/portal/login</span> and sign in with either account.
          </div>
        </div>
      ) : null}
    </div>
  );
}
