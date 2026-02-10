"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";

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
  aiReceptionistSeed?:
    | { ok: true; forced: boolean; inserted: number; skipped: boolean }
    | { ok: false; forced: boolean; error: string };
};

type SeedAiReceptionistResult =
  | { ok: true; forced: boolean; inserted: number; skipped: boolean; fullEmail: string }
  | { error: string; details?: string };

export default function PortalDemoSeeder() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [forceInboxSeed, setForceInboxSeed] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<SeedAiReceptionistResult | null>(null);
  const [forceAiSeed, setForceAiSeed] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (aiError) toast.error(aiError);
  }, [aiError, toast]);

  useEffect(() => {
    if (result?.inboxSeed && !result.inboxSeed.ok) {
      toast.error(`Inbox seed failed: ${result.inboxSeed.error}`);
    }
  }, [result?.inboxSeed, toast]);

  useEffect(() => {
    if (result?.aiReceptionistSeed && !result.aiReceptionistSeed.ok) {
      toast.error(`AI receptionist seed failed: ${result.aiReceptionistSeed.error}`);
    }
  }, [result?.aiReceptionistSeed, toast]);

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

  async function seedAiReceptionistOnly() {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);

    let res: Response;
    try {
      res = await fetch("/api/manager/portal/seed-ai-receptionist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: forceAiSeed }),
      });
    } catch (e) {
      setAiLoading(false);
      setAiError(e instanceof Error ? e.message : "Network error while seeding AI receptionist calls");
      return;
    }

    if (!res.ok) {
      setAiLoading(false);
      setAiError(await readErrorMessage(res));
      return;
    }

    const json = (await res.json().catch(() => ({}))) as SeedAiReceptionistResult;
    setAiResult(json);
    setAiLoading(false);
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
                <div className="mt-1 text-zinc-700">Failed: {result.inboxSeed.error}</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold text-brand-ink">AI Receptionist demo calls</div>
            <div className="mt-1 text-sm text-zinc-600">Seeds 3 demo calls into the existing demo-full account. Does not change passwords.</div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300"
                checked={forceAiSeed}
                onChange={(e) => setForceAiSeed(e.target.checked)}
                disabled={aiLoading}
              />
              Force reseed calls
            </label>
            <button
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              onClick={seedAiReceptionistOnly}
              disabled={aiLoading}
            >
              {aiLoading ? "Seeding…" : "Seed AI receptionist calls"}
            </button>
          </div>
        </div>

        {aiResult && (aiResult as any).ok ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Seeded AI Receptionist calls for <span className="font-semibold">{(aiResult as any).fullEmail}</span>.{" "}
            {(aiResult as any).skipped ? "Skipped (already present)." : `Inserted ${(aiResult as any).inserted}.`}
          </div>
        ) : null}
      </div>
    </div>
  );
}
