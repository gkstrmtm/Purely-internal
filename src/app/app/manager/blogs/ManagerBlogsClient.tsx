"use client";

import { useEffect, useMemo, useState } from "react";

type Settings = {
  weeklyEnabled: boolean;
  topicQueue: unknown;
  topicQueueCursor: number;
  lastWeeklyRunAt: string | null;
};

type SettingsResponse = {
  ok?: boolean;
  error?: string;
  settings?: Settings;
  stats?: {
    totalPosts: number;
    latest?: { slug: string; publishedAt: string } | null;
  };
};

type BackfillResponse = {
  ok?: boolean;
  error?: string;
  details?: string;
  createdCount?: number;
  skippedCount?: number;
  nextOffset?: number;
  hasMore?: boolean;
  nextUrl?: string | null;
};

type SuggestTopicsResponse = {
  ok?: boolean;
  error?: string;
  details?: string;
  topics?: string[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x) => typeof x === "string") as string[];
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });

  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const err = data as unknown as { error?: string };
    throw new Error(err?.error || `Request failed (${res.status})`);
  }

  return data;
}

export default function ManagerBlogsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [topicQueueText, setTopicQueueText] = useState("");

  const [stats, setStats] = useState<SettingsResponse["stats"]>(undefined);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const [forceWeekly, setForceWeekly] = useState(false);

  const [backfillCount, setBackfillCount] = useState(20);
  const [backfillDaysBetween, setBackfillDaysBetween] = useState(7);
  const [backfillOffset, setBackfillOffset] = useState(0);
  const [backfillMaxPerRequest, setBackfillMaxPerRequest] = useState(6);
  const [backfillTimeBudget, setBackfillTimeBudget] = useState(18);

  const [datesText, setDatesText] = useState("2025-08-01\n2025-08-08\n2025-08-15");

  const [topicSuggestCount, setTopicSuggestCount] = useState(25);
  const [topicSeed, setTopicSeed] = useState("");

  const parsedTopicQueue = useMemo(() => {
    const lines = topicQueueText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines;
  }, [topicQueueText]);

  const parsedDates = useMemo(() => {
    return datesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }, [datesText]);

  const backfillAtEnd = backfillOffset >= backfillCount;

  async function refresh() {
    setError(null);
    const data = await jsonFetch<SettingsResponse>("/api/manager/blogs/settings", { method: "GET" });

    setStats(data.stats);

    const s = data.settings;
    if (s) {
      setWeeklyEnabled(!!s.weeklyEnabled);
      const topics = asStringArray(s.topicQueue);
      setTopicQueueText(topics.join("\n"));
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!alive) return;
        await refresh();
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function saveSettings() {
    setError(null);
    setLastResult(null);
    const data = await jsonFetch<SettingsResponse>("/api/manager/blogs/settings", {
      method: "PATCH",
      body: JSON.stringify({
        weeklyEnabled,
        topicQueue: parsedTopicQueue,
      }),
    });
    setLastResult(data);
    await refresh();
  }

  async function runWeekly() {
    setError(null);
    setLastResult(null);
    const data = await jsonFetch<unknown>("/api/manager/blogs/run-weekly", {
      method: "POST",
      body: JSON.stringify({ force: forceWeekly }),
    });
    setLastResult(data);
    await refresh();
  }

  async function runBackfill() {
    setError(null);
    setLastResult(null);

    if (backfillAtEnd) {
      setError("Backfill offset is at the end of the range. Set offset to 0 (or increase count) and run again.");
      return;
    }

    const data = await jsonFetch<BackfillResponse>("/api/manager/blogs/backfill", {
      method: "POST",
      body: JSON.stringify({
        count: backfillCount,
        daysBetween: backfillDaysBetween,
        offset: backfillOffset,
        maxPerRequest: backfillMaxPerRequest,
        timeBudgetSeconds: backfillTimeBudget,
      }),
    });
    setLastResult(data);
    if (typeof data?.nextOffset === "number") setBackfillOffset(data.nextOffset);
    await refresh();
  }

  async function runDates() {
    setError(null);
    setLastResult(null);
    const data = await jsonFetch<unknown>("/api/manager/blogs/dates", {
      method: "POST",
      body: JSON.stringify({ dates: parsedDates }),
    });
    setLastResult(data);
    await refresh();
  }

  async function runSuggestTopics() {
    setError(null);
    setLastResult(null);
    const data = await jsonFetch<SuggestTopicsResponse>("/api/manager/blogs/suggest-topics", {
      method: "POST",
      body: JSON.stringify({ count: topicSuggestCount, seed: topicSeed, storeAsQueue: true }),
    });
    setLastResult(data);
    if (Array.isArray(data?.topics)) setTopicQueueText(data.topics.join("\n"));
    await refresh();
  }

  if (loading) {
    return <div className="text-sm text-zinc-600">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold text-brand-ink">Status</div>
            <div className="mt-1 text-xs text-zinc-600">
              Total posts: {stats?.totalPosts ?? "—"}
              {stats?.latest?.slug ? ` • Latest: ${stats.latest.slug}` : ""}
            </div>
          </div>
          <button
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            onClick={() => refresh().catch((e) => setError(e instanceof Error ? e.message : "Refresh failed"))}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-5">
          <div className="text-sm font-semibold text-brand-ink">Weekly automation</div>
          <p className="mt-1 text-xs text-zinc-600">
            Controls the weekly Vercel cron behavior. When disabled, cron will skip without generating a post.
          </p>

          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={weeklyEnabled}
              onChange={(e) => setWeeklyEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Weekly generation enabled
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              onClick={() => saveSettings().catch((e) => setError(e instanceof Error ? e.message : "Save failed"))}
            >
              Save settings
            </button>

            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={forceWeekly} onChange={(e) => setForceWeekly(e.target.checked)} className="h-4 w-4" />
              Force (ignore “already published” and disabled)
            </label>

            <button
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
              onClick={() => runWeekly().catch((e) => setError(e instanceof Error ? e.message : "Run failed"))}
            >
              Run weekly now
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-5">
          <div className="text-sm font-semibold text-brand-ink">Topic queue</div>
          <p className="mt-1 text-xs text-zinc-600">
            Optional list of future topics. Weekly runs will consume topics in order.
          </p>

          <textarea
            className="mt-4 h-40 w-full rounded-2xl border border-zinc-200 p-3 text-sm"
            value={topicQueueText}
            onChange={(e) => setTopicQueueText(e.target.value)}
            placeholder="One topic per line"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              onClick={() => saveSettings().catch((e) => setError(e instanceof Error ? e.message : "Save failed"))}
            >
              Save queue
            </button>

            <button
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
              onClick={() => runSuggestTopics().catch((e) => setError(e instanceof Error ? e.message : "Suggest failed"))}
            >
              Suggest topics
            </button>

            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <label className="text-xs text-zinc-600">Count</label>
              <input
                className="w-20 rounded-xl border border-zinc-200 px-2 py-1 text-sm"
                type="number"
                value={topicSuggestCount}
                onChange={(e) => setTopicSuggestCount(Number.parseInt(e.target.value || "0", 10))}
                min={5}
                max={60}
              />
            </div>

            <input
              className="min-w-[200px] flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Optional seed (industry, niche, angle)"
              value={topicSeed}
              onChange={(e) => setTopicSeed(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-5">
        <div className="text-sm font-semibold text-brand-ink">Backfill (batch)</div>
        <p className="mt-1 text-xs text-zinc-600">
          Creates older posts spaced by daysBetween. Increase Count to go further back in time. Uses offset + maxPerRequest so you can run safely in batches.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <label className="text-xs text-zinc-600">
            Count
            <input className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" type="number" value={backfillCount} onChange={(e) => setBackfillCount(Number.parseInt(e.target.value || "0", 10))} />
          </label>
          <label className="text-xs text-zinc-600">
            Days between
            <input className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" type="number" value={backfillDaysBetween} onChange={(e) => setBackfillDaysBetween(Number.parseInt(e.target.value || "0", 10))} />
          </label>
          <label className="text-xs text-zinc-600">
            Offset
            <input className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" type="number" value={backfillOffset} onChange={(e) => setBackfillOffset(Number.parseInt(e.target.value || "0", 10))} />
          </label>
          <label className="text-xs text-zinc-600">
            Max per request
            <input className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" type="number" value={backfillMaxPerRequest} onChange={(e) => setBackfillMaxPerRequest(Number.parseInt(e.target.value || "0", 10))} />
          </label>
          <label className="text-xs text-zinc-600">
            Time budget (s)
            <input className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" type="number" value={backfillTimeBudget} onChange={(e) => setBackfillTimeBudget(Number.parseFloat(e.target.value || "0"))} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={
              backfillAtEnd
                ? "rounded-2xl bg-zinc-300 px-4 py-2 text-sm font-bold text-white"
                : "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            }
            onClick={() => runBackfill().catch((e) => setError(e instanceof Error ? e.message : "Backfill failed"))}
            disabled={backfillAtEnd}
          >
            Run backfill batch
          </button>
          <div className="text-xs text-zinc-600">
            Tip: after each run, offset auto-advances to nextOffset.
            {backfillAtEnd ? " (Offset is at end — set offset to 0 to run again.)" : ""}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-5">
        <div className="text-sm font-semibold text-brand-ink">Generate for specific dates</div>
        <p className="mt-1 text-xs text-zinc-600">One date per line (YYYY-MM-DD). Posts won’t be duplicated if a date already has a post.</p>

        <textarea
          className="mt-4 h-32 w-full rounded-2xl border border-zinc-200 p-3 text-sm"
          value={datesText}
          onChange={(e) => setDatesText(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            onClick={() => runDates().catch((e) => setError(e instanceof Error ? e.message : "Generate failed"))}
          >
            Generate for dates
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-5">
        <div className="text-sm font-semibold text-brand-ink">Last result</div>
        <pre className="mt-3 max-h-[320px] overflow-auto rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-800">
          {lastResult ? JSON.stringify(lastResult, null, 2) : "Run an action to see output here."}
        </pre>
      </div>
    </div>
  );
}
