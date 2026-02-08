"use client";

import { useState } from "react";

type SeedResult = {
  full: { email: string; password: string };
  limited: { email: string; password: string };
  inboxSeed?:
    | {
        ok: true;
        forced: boolean;
        existingCountBefore: number;
        deletedThreads: number;
        deletedAttachments: number;
        insertedMessages: number;
        seededThreads: number;
        skipped: boolean;
      }
    | { ok: false; forced: boolean; error: string };
};

export default function PortalDemoSeeder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [forceInboxSeed, setForceInboxSeed] = useState(false);

  async function readErrorMessage(res: Response) {
    const text = await res.text().catch(() => "");
    if (!text) {
      const vercelId = res.headers.get("x-vercel-id");
      return `Unable to seed demo accounts (HTTP ${res.status})${vercelId ? ` • Vercel: ${vercelId}` : ""}`;
    }

    try {
      const json = JSON.parse(text);
      const error = json?.error ?? json?.message;
      const details = json?.details;
      const hint = json?.hint;

      if (details || hint) {
        const parts = [error, details, hint].filter(Boolean);
        return parts.join("\n");
      }

      return error ?? "Unable to seed demo accounts";
    } catch {
      const trimmed = text.replace(/\s+/g, " ").trim();
      // If Next.js returns an HTML error page, show a short snippet.
      return trimmed.slice(0, 240) || "Unable to seed demo accounts";
    }
  }

  async function seed() {
    setLoading(true);
    setError(null);
    setResult(null);

    let res: Response;
    try {
      res = await fetch("/api/manager/portal/seed-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forceInboxSeed }),
      });
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : "Network error while seeding demo accounts");
      return;
    }

    if (!res.ok) {
      setLoading(false);
      setError(await readErrorMessage(res));
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
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300"
              checked={forceInboxSeed}
              onChange={(e) => setForceInboxSeed(e.target.checked)}
              disabled={loading}
            />
            Force reseed inbox
          </label>
          <button
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            onClick={seed}
            disabled={loading}
          >
            {loading ? "Seeding…" : "Seed demo accounts"}
          </button>
        </div>
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
            Go to <span className="font-semibold">/login</span> and sign in with either account.
          </div>

          {result.inboxSeed ? (
            <div className="sm:col-span-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
              <div className="font-semibold">Inbox seed</div>
              {result.inboxSeed.ok ? (
                <div className="mt-1 text-zinc-700">
                  {result.inboxSeed.skipped
                    ? `Skipped (existingCountBefore=${result.inboxSeed.existingCountBefore}).`
                    : `Seeded ${result.inboxSeed.seededThreads} threads / ${result.inboxSeed.insertedMessages} messages.`}
                  {result.inboxSeed.forced
                    ? ` Forced: deletedThreads=${result.inboxSeed.deletedThreads}, deletedAttachments=${result.inboxSeed.deletedAttachments}.`
                    : null}
                </div>
              ) : (
                <div className="mt-1 text-red-700">Failed: {result.inboxSeed.error}</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
