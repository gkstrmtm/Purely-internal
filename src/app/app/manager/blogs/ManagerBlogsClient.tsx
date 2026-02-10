"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type Settings = {
  weeklyEnabled: boolean;
  topicQueue: unknown;
  topicQueueCursor: number;
  lastWeeklyRunAt: string | null;
  frequencyDays?: number;
  publishHourUtc?: number;
  publishMinuteUtc?: number;
};

type SettingsResponse = {
  ok?: boolean;
  error?: string;
  buildSha?: string | null;
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

type ManagerPostRow = {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  archivedAt?: string | null;
};

type PostsResponse = {
  ok?: boolean;
  error?: string;
  details?: string;
  hasArchivedAt?: boolean;
  posts?: ManagerPostRow[];
};

type BulkActionResponse = {
  ok?: boolean;
  error?: string;
  details?: string;
  action?: "archive" | "delete";
  updated?: number;
  deleted?: number;
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
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [runningWeekly, setRunningWeekly] = useState(false);
  const [savingQueue, setSavingQueue] = useState(false);
  const [suggestingTopics, setSuggestingTopics] = useState(false);
  const [runningBackfill, setRunningBackfill] = useState(false);
  const [runningDates, setRunningDates] = useState(false);

  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [frequencyDays, setFrequencyDays] = useState(7);
  const [publishHourUtc, setPublishHourUtc] = useState(14);
  const [topicQueueText, setTopicQueueText] = useState("");

  const [stats, setStats] = useState<SettingsResponse["stats"]>(undefined);
  const [buildSha, setBuildSha] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const [posts, setPosts] = useState<ManagerPostRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Record<string, boolean>>({});
  const [bulkWorking, setBulkWorking] = useState<"archive" | "delete" | null>(null);

  useEffect(() => {
    if (postsError) toast.error(postsError);
  }, [postsError, toast]);

  const [forceWeekly, setForceWeekly] = useState(false);

  const [backfillCount, setBackfillCount] = useState(20);
  const [backfillDaysBetween, setBackfillDaysBetween] = useState(7);
  const [backfillOffset, setBackfillOffset] = useState(0);
  const [backfillMaxPerRequest, setBackfillMaxPerRequest] = useState(1);
  const [backfillTimeBudget, setBackfillTimeBudget] = useState(60);
  const [backfillAnchor, setBackfillAnchor] = useState<"NOW" | "OLDEST_POST">("OLDEST_POST");

  const [backfillProgress, setBackfillProgress] = useState<{
    running: boolean;
    processed: number;
    count: number;
    created: number;
    skipped: number;
    lastBuildSha?: string | null;
    stoppedEarly?: boolean;
    message?: string;
  } | null>(null);

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

  const applySettings = useCallback((s: Settings) => {
    setWeeklyEnabled(!!s.weeklyEnabled);
    if (typeof s.frequencyDays === "number" && Number.isFinite(s.frequencyDays)) {
      setFrequencyDays(Math.min(30, Math.max(1, Math.floor(s.frequencyDays))));
    }
    if (typeof s.publishHourUtc === "number" && Number.isFinite(s.publishHourUtc)) {
      setPublishHourUtc(Math.min(23, Math.max(0, Math.floor(s.publishHourUtc))));
    }
    const topics = asStringArray(s.topicQueue);
    setTopicQueueText(topics.join("\n"));
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const data = await jsonFetch<SettingsResponse>(`/api/manager/blogs/settings?ts=${Date.now()}`, { method: "GET" });

    setStats(data.stats);
    setBuildSha(typeof data.buildSha === "string" ? data.buildSha : null);

    const s = data.settings;
    if (s) {
      applySettings(s);
    }
  }, [applySettings]);

  const refreshPosts = useCallback(
    async (opts?: { includeArchived?: boolean }) => {
      const wantArchived = typeof opts?.includeArchived === "boolean" ? opts.includeArchived : includeArchived;
      setPostsLoading(true);
      setPostsError(null);
      try {
        const url = `/api/manager/blogs/posts?take=250&includeArchived=${wantArchived ? "1" : "0"}&ts=${Date.now()}`;
        const data = await jsonFetch<PostsResponse>(url, { method: "GET" });
        setPosts(Array.isArray(data.posts) ? data.posts : []);
      } catch (e) {
        setPosts([]);
        setPostsError(e instanceof Error ? e.message : "Failed to load posts");
      } finally {
        setPostsLoading(false);
      }
    },
    [includeArchived],
  );

  const selectedIds = useMemo(() => Object.keys(selectedPostIds).filter((id) => selectedPostIds[id]), [selectedPostIds]);

  const togglePost = useCallback((id: string) => {
    setSelectedPostIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAllPosts = useCallback(() => {
    setSelectedPostIds((prev) => {
      const anySelected = posts.some((p) => prev[p.id]);
      if (anySelected) return {};
      const next: Record<string, boolean> = {};
      for (const p of posts) next[p.id] = true;
      return next;
    });
  }, [posts]);

  const runBulk = useCallback(
    async (action: "archive" | "delete") => {
      const ids = selectedIds;
      if (!ids.length) return;

      if (action === "delete") {
        const ok = window.confirm(`Delete ${ids.length} post(s) permanently? This cannot be undone.`);
        if (!ok) return;
      }

      setBulkWorking(action);
      setLastResult(null);
      setError(null);
      try {
        const res = await jsonFetch<BulkActionResponse>(`/api/manager/blogs/posts/bulk`, {
          method: "POST",
          body: JSON.stringify({ action, ids }),
        });
        setLastResult(res);
        setSelectedPostIds({});
        await refreshPosts();
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bulk action failed";
        setError(msg);
        setLastResult({ ok: false, error: msg });
      } finally {
        setBulkWorking(null);
      }
    },
    [refresh, refreshPosts, selectedIds],
  );

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
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!alive) return;
        await refreshPosts({ includeArchived });
      } catch {
        // refreshPosts already sets state
      }
    })();
    return () => {
      alive = false;
    };
  }, [includeArchived, refreshPosts]);

  async function saveSettings() {
    setError(null);
    setLastResult(null);
    setSavingSettings(true);
    try {
      const data = await jsonFetch<SettingsResponse>("/api/manager/blogs/settings", {
        method: "PATCH",
        body: JSON.stringify({
          weeklyEnabled,
          frequencyDays,
          publishHourUtc,
          topicQueue: parsedTopicQueue,
        }),
      });
      setLastResult(data);
      if (data.settings) applySettings(data.settings);
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
          frequencyDays,
          topicQueue: parsedTopicQueue,
        }),
      });
      setLastResult(data);
      if (data.settings) applySettings(data.settings);
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
    setBackfillProgress(null);

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

      setBackfillProgress({
        running: true,
        processed: Math.min(backfillCount, Math.max(0, offset)),
        count: backfillCount,
        created: 0,
        skipped: 0,
      });

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
          setBackfillProgress((p) =>
            p
              ? {
                  ...p,
                  running: false,
                  stoppedEarly: true,
                  message: "Stopped: offset did not advance.",
                }
              : p,
          );
          break;
        }

        offset = nextOffset;
        setBackfillOffset(offset);

        setBackfillProgress({
          running: true,
          processed: Math.min(backfillCount, Math.max(0, offset)),
          count: backfillCount,
          created: totalCreated,
          skipped: totalSkipped,
          lastBuildSha: data.buildSha ?? null,
          stoppedEarly: !!data.stoppedEarly,
          message: data.message,
        });

        if (data.stoppedEarly) break;
        if (data.hasMore === false) break;
        if (offset >= backfillCount) break;
      }

      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Backfill failed";
      setError(msg);
      setLastResult({ ok: false, error: msg });
      setBackfillProgress((p) =>
        p
          ? {
              ...p,
              running: false,
              stoppedEarly: true,
              message: msg,
            }
          : {
              running: false,
              processed: 0,
              count: backfillCount,
              created: 0,
              skipped: 0,
              stoppedEarly: true,
              message: msg,
            },
      );
    } finally {
      setRunningBackfill(false);
      setBackfillProgress((p) => (p ? { ...p, running: false } : p));
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
      <div className="rounded-2xl border border-zinc-200 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold text-brand-ink">Status</div>
            <div className="mt-1 text-xs text-zinc-600">
              Total posts: {stats?.totalPosts ?? "—"}
              {stats?.latest?.slug ? ` • Latest: ${stats.latest.slug}` : ""}
              {buildSha ? ` • Build: ${buildSha.slice(0, 8)}` : ""}
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
            Automation schedule
            <InfoTip text="Controls the scheduled generation cadence. Frequency sets how often a new post is created (daily / every 3 days / weekly). The cron runs regularly, but will only publish when due." />
          </div>
          <p className="mt-1 text-xs text-zinc-600">Set how often automation publishes. When disabled, cron will skip without generating.</p>

          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={weeklyEnabled}
              onChange={(e) => setWeeklyEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Automation enabled
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-700">
            <div className="text-xs text-zinc-600">Frequency</div>
            <select
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={String(frequencyDays)}
              onChange={(e) => setFrequencyDays(Number.parseInt(e.target.value || "7", 10) || 7)}
            >
              <option value="1">Every day</option>
              <option value="3">Every 3 days</option>
              <option value="7">Weekly</option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-700">
            <div className="text-xs text-zinc-600">Publish time (UTC)</div>
            <select
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={String(publishHourUtc)}
              onChange={(e) => setPublishHourUtc(Number.parseInt(e.target.value || "14", 10) || 14)}
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00 UTC
                </option>
              ))}
            </select>
          </div>

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
                {runningWeekly ? "Generating…" : "Run now"}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-brand-ink">
            Existing posts
            <InfoTip text="Select posts to archive (hide from /blogs) or delete permanently." />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            onClick={() => refreshPosts()}
            disabled={postsLoading}
          >
            <span className="inline-flex items-center gap-2">
              {postsLoading ? <Spinner /> : null}
              {postsLoading ? "Loading…" : "Refresh list"}
            </span>
          </button>

          <button
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
            onClick={() => toggleAllPosts()}
            disabled={posts.length === 0}
          >
            Select all / none
          </button>

          <button
            className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => runBulk("archive")}
            disabled={bulkWorking !== null || selectedIds.length === 0}
          >
            <span className="inline-flex items-center gap-2">
              {bulkWorking === "archive" ? <Spinner /> : null}
              {bulkWorking === "archive" ? "Archiving…" : `Archive (${selectedIds.length})`}
            </span>
          </button>

          <button
            className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            onClick={() => runBulk("delete")}
            disabled={bulkWorking !== null || selectedIds.length === 0}
          >
            <span className="inline-flex items-center gap-2">
              {bulkWorking === "delete" ? <Spinner /> : null}
              {bulkWorking === "delete" ? "Deleting…" : `Delete (${selectedIds.length})`}
            </span>
          </button>
        </div>

        <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-zinc-200">
          {posts.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No posts found.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="w-10 p-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300"
                      checked={posts.length > 0 && posts.every((p) => Boolean(selectedPostIds[p.id]))}
                      onChange={() => toggleAllPosts()}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Published</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => {
                  const archived = Boolean(p.archivedAt);
                  return (
                    <tr key={p.id} className={archived ? "bg-zinc-50" : "bg-white"}>
                      <td className="p-3 align-top">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-zinc-300"
                          checked={Boolean(selectedPostIds[p.id])}
                          onChange={() => togglePost(p.id)}
                          aria-label={`Select ${p.title}`}
                        />
                      </td>
                      <td className="p-3 align-top">
                        <div className={archived ? "text-zinc-500 line-through" : "text-zinc-900"}>{p.title}</div>
                      </td>
                      <td className="p-3 align-top text-xs text-zinc-600">{p.slug}</td>
                      <td className="p-3 align-top text-xs text-zinc-600">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleString() : ""}
                      </td>
                      <td className="p-3 align-top text-xs">
                        {archived ? (
                          <span className="rounded-full bg-zinc-200 px-2 py-1 text-zinc-700">archived</span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">active</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-2 text-xs text-zinc-600">
          Archive hides a post from /blogs (soft delete). Delete removes it permanently.
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

          {backfillProgress ? (
            <div className="flex flex-col justify-center text-xs text-zinc-600">
              <div className="font-semibold text-zinc-800">
                {backfillProgress.running ? "Backfill running" : "Backfill status"}: {backfillProgress.processed}/{backfillProgress.count} done
              </div>
              <div>
                Created: {backfillProgress.created} • Skipped: {backfillProgress.skipped}
                {backfillProgress.stoppedEarly ? " • Stopped early" : ""}
              </div>
              {backfillProgress.message ? <div className="text-zinc-500">{backfillProgress.message}</div> : null}
            </div>
          ) : null}

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
