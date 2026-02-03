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
  message?: string;
  stoppedEarly?: boolean;
  anchor?: "NOW" | "OLDEST_POST";
  targetDates?: string[];
  pendingCount?: number;
  createdCount?: number;
  skippedCount?: number;
  nextOffset?: number;
  hasMore?: boolean;
  nextUrl?: string | null;
  buildSha?: string | null;
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

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "h-4 w-4 animate-spin"}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      className="ml-2 inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-bold text-zinc-600"
      title={text}
      aria-label={text}
    >
      i
    </span>
  );
}

export default function ManagerBlogsClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingSettings, setSavingSettings] = useState(false);
  const [runningWeekly, setRunningWeekly] = useState(false);
  const [savingQueue, setSavingQueue] = useState(false);
  const [suggestingTopics, setSuggestingTopics] = useState(false);
  const [runningBackfill, setRunningBackfill] = useState(false);
  const [runningDates, setRunningDates] = useState(false);

  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [topicQueueText, setTopicQueueText] = useState("");

  const [stats, setStats] = useState<SettingsResponse["stats"]>(undefined);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const [forceWeekly, setForceWeekly] = useState(false);

  const [backfillCount, setBackfillCount] = useState(20);
  const [backfillDaysBetween, setBackfillDaysBetween] = useState(7);
  const [backfillOffset, setBackfillOffset] = useState(0);
  const [backfillMaxPerRequest, setBackfillMaxPerRequest] = useState(1);
  const [backfillTimeBudget, setBackfillTimeBudget] = useState(60);
  const [backfillAnchor, setBackfillAnchor] = useState<"NOW" | "OLDEST_POST">("OLDEST_POST");

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
    setSavingSettings(true);
    try {
      const data = await jsonFetch<SettingsResponse>("/api/manager/blogs/settings", {
        method: "PATCH",
        body: JSON.stringify({
          weeklyEnabled,
          topicQueue: parsedTopicQueue,
        }),
      });
      setLastResult(data);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      setLastResult({ ok: false, error: msg });
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveQueueOnly() {
    setError(null);
    setLastResult(null);
    setSavingQueue(true);
    try {
      const data = await jsonFetch<SettingsResponse>("/api/manager/blogs/settings", {
        method: "PATCH",
        body: JSON.stringify({
          weeklyEnabled,
          topicQueue: parsedTopicQueue,
        }),
      });
      setLastResult(data);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      setLastResult({ ok: false, error: msg });
    } finally {
      setSavingQueue(false);
    }
  }

  async function runWeekly() {
    setError(null);
    setLastResult(null);
    setRunningWeekly(true);
    try {
      const data = await jsonFetch<unknown>("/api/manager/blogs/run-weekly", {
        method: "POST",
        body: JSON.stringify({ force: forceWeekly }),
      });
      setLastResult(data);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Run failed";
      setError(msg);
      setLastResult({ ok: false, error: msg });
    } finally {
      setRunningWeekly(false);
    }
  }

  async function runBackfill() {
    setError(null);
    setLastResult(null);

    if (backfillAtEnd) {
      setError("Backfill offset is at the end of the range. Set offset to 0 (or increase count) and run again.");
      return;
    }

    setRunningBackfill(true);
    try {
      let offset = backfillOffset;
      let safety = 0;
      let totalCreated = 0;
      let totalSkipped = 0;

      while (safety < 200) {
        safety++;
        const data = await jsonFetch<BackfillResponse>("/api/manager/blogs/backfill", {
          method: "POST",
          body: JSON.stringify({
            count: backfillCount,
            daysBetween: backfillDaysBetween,
            offset,
            // Keep requests reliable; the loop continues until the window is done.
            maxPerRequest: 1,
            timeBudgetSeconds: backfillTimeBudget,
            anchor: backfillAnchor,
          }),
        });

        totalCreated += typeof data.createdCount === "number" ? data.createdCount : 0;
        totalSkipped += typeof data.skippedCount === "number" ? data.skippedCount : 0;

        setLastResult({
          ...data,
          autoProgress: {
            totalCreated,
            totalSkipped,
            currentOffset: offset,
            count: backfillCount,
          },
        });

        const nextOffset = typeof data?.nextOffset === "number" ? data.nextOffset : offset;
        if (nextOffset <= offset) {
          setError("Backfill did not advance offset; stopping to avoid an infinite loop.");
          break;
        }

        offset = nextOffset;
        setBackfillOffset(offset);

        if (data.stoppedEarly) break;
        if (data.hasMore === false) break;
        if (offset >= backfillCount) break;
      }

      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Backfill failed";
      setError(msg);
      setLastResult({ ok: false, error: msg });
    } finally {
      setRunningBackfill(false);
    }
  }

  async function runDates() {
    setError(null);
    setLastResult(null);
    setRunningDates(true);
    try {
      const data = await jsonFetch<unknown>("/api/manager/blogs/dates", {
        method: "POST",
        body: JSON.stringify({ dates: parsedDates }),
      });
      setLastResult(data);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setError(msg);
      setLastResult({ ok: false, error: msg });
    } finally {
      setRunningDates(false);
    }
  }

  async function runSuggestTopics() {
    setError(null);
    setLastResult(null);
    setSuggestingTopics(true);
    try {
      const data = await jsonFetch<SuggestTopicsResponse>("/api/manager/blogs/suggest-topics", {
        method: "POST",
        body: JSON.stringify({ count: topicSuggestCount, seed: topicSeed, storeAsQueue: true }),
      });
      setLastResult(data);
      if (Array.isArray(data?.topics)) setTopicQueueText(data.topics.join("\n"));
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Suggest failed";
      setError(msg);
      setLastResult({ ok: false, error: msg });
    } finally {
      setSuggestingTopics(false);
    }
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
          <div className="text-sm font-semibold text-brand-ink">
            Weekly automation
            <InfoTip text="Controls the weekly scheduled generation. Save settings updates the enabled flag and topic queue. Run weekly now runs immediately. Force ignores disabled/already-published checks." />
          </div>
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
              onClick={() => saveSettings()}
              disabled={savingSettings}
            >
              <span className="inline-flex items-center gap-2">
                {savingSettings ? <Spinner /> : null}
                {savingSettings ? "Saving…" : "Save settings"}
              </span>
            </button>

            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={forceWeekly} onChange={(e) => setForceWeekly(e.target.checked)} className="h-4 w-4" />
              Force (ignore “already published” and disabled)
            </label>

            <button
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
              onClick={() => runWeekly()}
              disabled={runningWeekly}
            >
              <span className="inline-flex items-center gap-2">
                {runningWeekly ? <Spinner /> : null}
                {runningWeekly ? "Generating…" : "Run weekly now"}
              </span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-5">
          <div className="text-sm font-semibold text-brand-ink">
            Topic queue
            <InfoTip text="Optional topics (one per line). Weekly runs consume in order. Suggest topics generates ideas and stores them as the queue." />
          </div>
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
              onClick={() => saveQueueOnly()}
              disabled={savingQueue}
            >
              <span className="inline-flex items-center gap-2">
                {savingQueue ? <Spinner /> : null}
                {savingQueue ? "Saving…" : "Save queue"}
              </span>
            </button>

            <button
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
              onClick={() => runSuggestTopics()}
              disabled={suggestingTopics}
            >
              <span className="inline-flex items-center gap-2">
                {suggestingTopics ? <Spinner /> : null}
                {suggestingTopics ? "Generating…" : "Suggest topics"}
              </span>
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
        <div className="text-sm font-semibold text-brand-ink">
          Backfill (batch)
          <InfoTip text="Backfill creates older posts in safe batches. Anchor=where you start (today vs earlier than oldest post). Count=total range size. Offset=where you are in that range. Max per request=batch size per click. Days between=spacing. Time budget=stop early to avoid timeouts." />
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          Creates older posts spaced by daysBetween. Increase Count to go further back in time. Uses offset + maxPerRequest so you can run safely in batches.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-700">
          <label className="text-xs text-zinc-600">Anchor</label>
          <select
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            value={backfillAnchor}
            onChange={(e) => setBackfillAnchor((e.target.value as "NOW" | "OLDEST_POST") ?? "OLDEST_POST")}
          >
            <option value="OLDEST_POST">Oldest existing post (keep going further back)</option>
            <option value="NOW">Today (fills recent history)</option>
          </select>
        </div>

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
            onClick={() => runBackfill()}
            disabled={backfillAtEnd || runningBackfill}
          >
            <span className="inline-flex items-center gap-2">
              {runningBackfill ? <Spinner /> : null}
              {runningBackfill ? "Generating…" : "Run backfill batch"}
            </span>
          </button>
          <div className="text-xs text-zinc-600">
            Tip: after each run, offset auto-advances to nextOffset.
            {backfillAtEnd ? " (Offset is at end — set offset to 0 to run again.)" : ""}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-5">
        <div className="text-sm font-semibold text-brand-ink">
          Generate for specific dates
          <InfoTip text="Generates posts for the exact dates you list (one per line). If a date already has a post, it will be skipped." />
        </div>
        <p className="mt-1 text-xs text-zinc-600">One date per line (YYYY-MM-DD). Posts won’t be duplicated if a date already has a post.</p>

        <textarea
          className="mt-4 h-32 w-full rounded-2xl border border-zinc-200 p-3 text-sm"
          value={datesText}
          onChange={(e) => setDatesText(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            onClick={() => runDates()}
            disabled={runningDates}
          >
            <span className="inline-flex items-center gap-2">
              {runningDates ? <Spinner /> : null}
              {runningDates ? "Generating…" : "Generate for dates"}
            </span>
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
