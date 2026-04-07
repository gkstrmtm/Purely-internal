"use client";

import { useEffect, useState } from "react";

import { ToggleSwitch } from "@/components/ToggleSwitch";
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
  puraDemoSeed?:
    | {
        ok: true;
        forced: boolean;
        contactsCreated: number;
        contactsUpdated: number;
        tasksCreated: number;
        tasksUpdated: number;
        reviewsCreated: number;
        reviewsUpdated: number;
        linkedInboxThreads: number;
        serviceSetupsUpdated: number;
      }
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

  const [puraLoading, setPuraLoading] = useState(false);
  const [puraError, setPuraError] = useState<string | null>(null);
  const [puraResult, setPuraResult] = useState<SeedResult | null>(null);
  const [forcePuraSeed, setForcePuraSeed] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (aiError) toast.error(aiError);
  }, [aiError, toast]);

  useEffect(() => {
    if (puraError) toast.error(puraError);
  }, [puraError, toast]);

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

  useEffect(() => {
    if (puraResult?.puraDemoSeed && !puraResult.puraDemoSeed.ok) {
      toast.error(`Pura demo seed failed: ${puraResult.puraDemoSeed.error}`);
    }
  }, [puraResult?.puraDemoSeed, toast]);

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

  async function seedPuraDemo() {
    setPuraLoading(true);
    setPuraError(null);
    setPuraResult(null);

    let res: Response;
    try {
      res = await fetch("/api/manager/portal/seed-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skipPasswordReset: true,
          forcePuraSeed,
          forceInboxSeed: forcePuraSeed,
          forceAiReceptionistSeed: forcePuraSeed,
        }),
      });
    } catch (e) {
      setPuraLoading(false);
      setPuraError(e instanceof Error ? e.message : "Network error while seeding Pura demo data");
      return;
    }

    if (!res.ok) {
      setPuraLoading(false);
      setPuraError(await readErrorMessage(res));
      return;
    }

    const json = (await res.json()) as SeedResult;
    setPuraResult(json);
    setPuraLoading(false);
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
          <div className="inline-flex items-center gap-3 text-sm text-zinc-700">
            <ToggleSwitch
              checked={forceInboxSeed}
              onChange={setForceInboxSeed}
              disabled={loading}
              ariaLabel="Force reseed inbox"
            />
            <span>Force reseed inbox</span>
          </div>
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
            <div className="inline-flex items-center gap-3 text-sm text-zinc-700">
              <ToggleSwitch
                checked={forceAiSeed}
                onChange={setForceAiSeed}
                disabled={aiLoading}
                ariaLabel="Force reseed calls"
              />
              <span>Force reseed calls</span>
            </div>
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

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold text-brand-ink">Pura demo data</div>
            <div className="mt-1 text-sm text-zinc-600">
              Seeds contacts, tasks, reviews, inbox links, and core service setup data for `demo-full@purelyautomation.dev` without changing the current password.
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex items-center gap-3 text-sm text-zinc-700">
              <ToggleSwitch
                checked={forcePuraSeed}
                onChange={setForcePuraSeed}
                disabled={puraLoading}
                ariaLabel="Force reseed Pura demo data"
              />
              <span>Force reseed all</span>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              onClick={seedPuraDemo}
              disabled={puraLoading}
            >
              {puraLoading ? "Seeding…" : "Seed Pura demo data"}
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          Prompt checklist lives in the repo at <span className="font-semibold text-brand-ink">docs/pura-demo-prompt-checklist.md</span>.
        </div>

        {puraResult?.puraDemoSeed && puraResult.puraDemoSeed.ok ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Seeded Pura demo data for <span className="font-semibold">{puraResult.full.email}</span>. Contacts {puraResult.puraDemoSeed.contactsCreated + puraResult.puraDemoSeed.contactsUpdated}, tasks {puraResult.puraDemoSeed.tasksCreated + puraResult.puraDemoSeed.tasksUpdated}, reviews {puraResult.puraDemoSeed.reviewsCreated + puraResult.puraDemoSeed.reviewsUpdated}, linked inbox threads {puraResult.puraDemoSeed.linkedInboxThreads}.
          </div>
        ) : null}
      </div>
    </div>
  );
}
