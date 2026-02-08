"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
  billing: { configured: boolean };
};

type Site = {
  id: string;
  name: string;
  slug: string | null;
  primaryDomain: string | null;
  verificationToken: string;
  verifiedAt: string | null;
};

type PostRow = {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

type AutomationSettings = {
  enabled: boolean;
  frequencyDays: number;
  topics: string[];
  autoPublish: boolean;
  lastGeneratedAt: string | null;
  nextDueAt: string | null;
  lastRunAt?: string | null;
};

function sanitizeTopics(items: string[]): string[] {
  const raw = (Array.isArray(items) ? items : []).map((x) => String(x || "").trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 50) break;
  }
  return out;
}

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
}

export function PortalBlogsClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [credits, setCredits] = useState<number | null>(null);
  const [billingPath, setBillingPath] = useState<string>("/portal/app/billing");
  const [blogCreditsUsed30d, setBlogCreditsUsed30d] = useState<number | null>(null);
  const [blogGenerations30d, setBlogGenerations30d] = useState<number | null>(null);
  const [generatingNow, setGeneratingNow] = useState(false);

  const [siteName, setSiteName] = useState("");
  const [siteSlug, setSiteSlug] = useState("");
  const [siteSaving, setSiteSaving] = useState(false);
  const [rightTab, setRightTab] = useState<"automation" | "settings">("automation");

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoFrequencyDays, setAutoFrequencyDays] = useState(7);
  const [autoTopics, setAutoTopics] = useState<string[]>([]);
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

  const entitled = Boolean(me?.entitlements?.blog);

  const publicBlogUrl = useMemo(() => {
    const handle = site?.slug ?? site?.id;
    if (!handle) return null;
    if (typeof window === "undefined") return `/${handle}/blogs`;
    return `${window.location.origin}/${handle}/blogs`;
  }, [site?.id, site?.slug]);

  const publicBlogUrlPreview = useMemo(() => {
    const handle = siteSlug.trim() || site?.slug || site?.id;
    if (!handle) return null;
    if (typeof window === "undefined") return `/${handle}/blogs`;
    return `${window.location.origin}/${handle}/blogs`;
  }, [site?.id, site?.slug, siteSlug]);

  const creditsPerWeekEstimate = useMemo(() => {
    const freq = Math.max(1, Math.floor(Number(autoFrequencyDays) || 7));
    const postsPerWeek = Math.ceil(7 / freq);
    return Math.max(0, postsPerWeek - 1);
  }, [autoFrequencyDays]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [meRes, siteRes, postsRes, autoRes, creditsRes, usageRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store" }),
      fetch("/api/portal/blogs/site", { cache: "no-store" }),
      fetch("/api/portal/blogs/posts?take=100", { cache: "no-store" }),
      fetch("/api/portal/blogs/automation/settings", { cache: "no-store" }),
      fetch("/api/portal/credits", { cache: "no-store" }),
      fetch("/api/portal/blogs/usage?range=30d", { cache: "no-store" }),
    ]);

    const meJson = (await meRes.json().catch(() => ({}))) as Partial<Me>;
    const siteJson = (await siteRes.json().catch(() => ({}))) as { site?: Site | null; error?: string };
    const postsJson = (await postsRes.json().catch(() => ({}))) as { posts?: PostRow[]; error?: string };
    const autoJson = (await autoRes.json().catch(() => ({}))) as { settings?: AutomationSettings; error?: string };
    const creditsJson = (await creditsRes.json().catch(() => ({}))) as { credits?: number; billingPath?: string };
    const usageJson = (await usageRes.json().catch(() => ({}))) as {
      creditsUsed?: { range?: number };
      generations?: { range?: number };
    };

    if (!meRes.ok) {
      setError((meJson as { error?: string })?.error ?? "Unable to load account");
      setLoading(false);
      return;
    }

    setMe(meJson as Me);

    if (!siteRes.ok) {
      setError(siteJson.error ?? "Unable to load blog settings");
    }

    const s = siteJson.site ?? null;
    setSite(s);
    setSiteName(s?.name ?? "");
    setSiteSlug(s?.slug ?? "");

    setPosts(Array.isArray(postsJson.posts) ? postsJson.posts : []);

    if (creditsRes.ok) {
      setCredits(typeof creditsJson.credits === "number" && Number.isFinite(creditsJson.credits) ? creditsJson.credits : 0);
      setBillingPath(
        typeof creditsJson.billingPath === "string" && creditsJson.billingPath.trim()
          ? creditsJson.billingPath
          : "/portal/app/billing",
      );
    }

    if (usageRes.ok) {
      const used = usageJson?.creditsUsed?.range;
      const gens = usageJson?.generations?.range;
      setBlogCreditsUsed30d(typeof used === "number" && Number.isFinite(used) ? used : 0);
      setBlogGenerations30d(typeof gens === "number" && Number.isFinite(gens) ? gens : 0);
    }

    if (autoRes.ok && autoJson.settings) {
      setAutomation(autoJson.settings);
      setAutoEnabled(Boolean(autoJson.settings.enabled));
      setAutoFrequencyDays(
        typeof autoJson.settings.frequencyDays === "number" && Number.isFinite(autoJson.settings.frequencyDays)
          ? autoJson.settings.frequencyDays
          : 7,
      );
      setAutoTopics(sanitizeTopics((autoJson.settings.topics ?? []) as any));
      setAutoPublish(Boolean(autoJson.settings.autoPublish));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const onFocus = () => void refreshAll();
    const onVis = () => {
      if (!document.hidden) void refreshAll();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshAll]);

  useEffect(() => {
    setRightTab(site ? "automation" : "settings");
  }, [site]);

  async function createSite() {
    setSiteSaving(true);
    setError(null);

    const res = await fetch("/api/portal/blogs/site", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: siteName || "My Blog", slug: siteSlug, primaryDomain: site?.primaryDomain ?? "" }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; site?: Site; error?: string };
    setSiteSaving(false);

    if (!res.ok || !json.ok || !json.site) {
      setError(json.error ?? "Unable to create blog site");
      return;
    }

    setSite(json.site);
    setSiteName(json.site.name);
    setSiteSlug(json.site.slug ?? "");
    await refreshAll();
  }

  async function saveSite() {
    if (!siteName.trim()) return;

    setSiteSaving(true);
    setError(null);

    const res = await fetch("/api/portal/blogs/site", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: siteName,
        slug: siteSlug,
        // Preserve existing domain until the UI supports editing it again.
        primaryDomain: site?.primaryDomain ?? "",
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; site?: Site; error?: string };
    setSiteSaving(false);

    if (!res.ok || !json.ok || !json.site) {
      setError(json.error ?? "Unable to save blog settings");
      return;
    }

    setSite(json.site);
    setSiteName(json.site.name);
    setSiteSlug(json.site.slug ?? "");
    await refreshAll();
  }

  async function newDraft() {
    if (!site) {
      setError("Create your blog workspace first (Blog settings → Create blog workspace).");
      return;
    }

    setError(null);
    const res = await fetch("/api/portal/blogs/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: { id: string }; error?: string };
    if (!res.ok || !json.ok || !json.post?.id) {
      setError(json.error ?? "Unable to create draft");
      return;
    }

    window.location.href = `/portal/app/services/blogs/${json.post.id}`;
  }

  async function saveAutomation() {
    setAutoSaving(true);
    setError(null);

    const topics = sanitizeTopics(autoTopics);
    const res = await fetch("/api/portal/blogs/automation/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: Boolean(autoEnabled),
        frequencyDays: Math.min(30, Math.max(1, Math.floor(Number(autoFrequencyDays) || 7))),
        topics,
        autoPublish: Boolean(autoPublish),
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; settings?: Partial<AutomationSettings> };
    setAutoSaving(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to save automation settings");
      return;
    }

    await refreshAll();
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Loading blogs…
        </div>
      </div>
    );
  }

  if (!entitled) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="text-sm font-semibold text-zinc-900">Automated Blogs</div>
          <div className="mt-2 text-sm text-zinc-600">
            This service isn’t active on your plan yet.
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/portal/app/billing"
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Unlock in billing
            </Link>
            <Link
              href="/portal/app/services"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Back to services
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Blogs</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Draft posts here, then publish them on your own website.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/portal/app/onboarding"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Onboarding
          </Link>
          <button
            type="button"
            onClick={newDraft}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            New draft
          </button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Your posts</div>
          <div className="mt-2 text-sm text-zinc-600">
            Edit drafts, export Markdown, and keep everything organized.
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {posts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-zinc-600" colSpan={3}>
                      No posts yet. Click “New draft” to start.
                    </td>
                  </tr>
                ) : (
                  posts.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-200">
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/app/services/blogs/${p.id}`}
                          className="font-semibold text-brand-ink hover:underline"
                        >
                          {p.title || "Untitled"}
                        </Link>
                        <div className="mt-1 truncate text-xs text-zinc-500">/{p.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex rounded-full px-2 py-1 text-xs font-semibold " +
                            (p.status === "PUBLISHED"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-100 text-zinc-700")
                          }
                        >
                          {p.status === "PUBLISHED" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{formatDate(p.updatedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
            Your website publishing is up to you (WordPress, Webflow, Shopify, etc.). We’ll keep drafts exportable.
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Credits</div>
                <div className="mt-2 text-sm text-zinc-600">Usage-based: 1 credit per generated blog post.</div>
              </div>
              <Link
                href={billingPath}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Billing
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Total credits</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">{credits === null ? "—" : credits.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">Credits used</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">
                  {blogCreditsUsed30d === null ? "—" : blogCreditsUsed30d.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Last 30 days · {blogGenerations30d === null ? "—" : blogGenerations30d} generation{blogGenerations30d === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Blog automation</div>
            <div className="mt-2 text-sm text-zinc-600">Schedule generation and manage workspace settings.</div>

            <div className="mt-4 inline-flex w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <button
                type="button"
                onClick={() => setRightTab("automation")}
                className={
                  "flex-1 px-4 py-2 text-sm font-semibold " +
                  (rightTab === "automation" ? "bg-zinc-50 text-brand-ink" : "text-zinc-600 hover:bg-zinc-50")
                }
              >
                Automation
              </button>
              <button
                type="button"
                onClick={() => setRightTab("settings")}
                className={
                  "flex-1 border-l border-zinc-200 px-4 py-2 text-sm font-semibold " +
                  (rightTab === "settings" ? "bg-zinc-50 text-brand-ink" : "text-zinc-600 hover:bg-zinc-50")
                }
              >
                Settings
              </button>
            </div>

            {rightTab === "settings" ? (
              <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Blog name</label>
                <input
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  onBlur={() => {
                    if (!site) return;
                    if (siteSaving) return;
                    void saveSite();
                  }}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="My Company Blog"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Blog URL slug</label>
                <input
                  value={siteSlug}
                  onChange={(e) => setSiteSlug(e.target.value)}
                  onBlur={() => {
                    if (!site) return;
                    if (siteSaving) return;
                    void saveSite();
                  }}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="home2smart"
                />
                <div className="mt-1 text-xs text-zinc-500">
                  Your public blog will be at {publicBlogUrlPreview ?? "…"}. Leave blank to use your business name.
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Hosted blog link</label>
                <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                    <div className="truncate">{publicBlogUrlPreview ?? "Create your blog workspace to get a link."}</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    disabled={!publicBlogUrlPreview}
                    onClick={async () => {
                      if (!publicBlogUrlPreview) return;
                      await navigator.clipboard.writeText(publicBlogUrlPreview);
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  This is your public blog hosted on Purely Automation. If you also want to publish elsewhere, use “Export Markdown”.
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {!site ? (
                  <button
                    type="button"
                    onClick={createSite}
                    disabled={siteSaving || !siteName.trim()}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {siteSaving ? "Creating…" : "Create blog workspace"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={saveSite}
                    disabled={siteSaving || !siteName.trim()}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {siteSaving ? "Saving…" : "Save settings"}
                  </button>
                )}
              </div>
            </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Automation schedule</div>
                <div className="mt-1 text-sm text-zinc-600">Set it once, and we’ll generate posts on schedule.</div>

                <div className="mt-4 space-y-3">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-zinc-800">Enable automation</span>
                    <input
                      type="checkbox"
                      checked={autoEnabled}
                      onChange={(e) => setAutoEnabled(e.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Frequency</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={autoFrequencyDays}
                        onChange={(e) => setAutoFrequencyDays(Number(e.target.value))}
                        className="w-24 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      />
                      <div className="text-sm text-zinc-600">days per post</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Example: 7 = weekly, 14 = every 2 weeks.</div>
                    {Number(autoFrequencyDays) < 7 ? (
                      <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        More often than weekly uses credits. Estimated: {creditsPerWeekEstimate} credit{creditsPerWeekEstimate === 1 ? "" : "s"} / week.
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Topics (optional)</label>
                    <div className="mt-1 space-y-2">
                      {autoTopics.length === 0 ? (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                          Add a few topics to guide what gets generated.
                        </div>
                      ) : null}

                      {autoTopics.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            value={t}
                            onChange={(e) => {
                              const next = [...autoTopics];
                              next[idx] = e.target.value;
                              setAutoTopics(next);
                            }}
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                            placeholder={idx === 0 ? "Local SEO tips" : "Another topic"}
                          />
                          <button
                            type="button"
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                            onClick={() => {
                              const next = autoTopics.filter((_, i) => i !== idx);
                              setAutoTopics(next);
                            }}
                            aria-label="Remove topic"
                          >
                            Remove
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                        onClick={() => setAutoTopics((prev) => [...prev, ""]) }
                      >
                        + Add topic
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Topics in queue: {sanitizeTopics(autoTopics).length}</div>
                  </div>

                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-zinc-800">Auto-publish (optional)</span>
                    <input
                      type="checkbox"
                      checked={autoPublish}
                      onChange={(e) => setAutoPublish(e.target.checked)}
                      className="h-5 w-5"
                    />
                  </label>
                  <div className="text-xs text-zinc-500">
                    Auto-publish marks posts as “Published” in this portal (and backdates when catching up). If you publish elsewhere, keep this off and export.
                  </div>

                  <button
                    type="button"
                    onClick={saveAutomation}
                    disabled={autoSaving}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {autoSaving ? "Saving…" : "Save automation"}
                  </button>

                  <button
                    type="button"
                    disabled={generatingNow || !site}
                    onClick={async () => {
                      if (!site) {
                        setError("Create your blog workspace first (Settings → Create blog workspace). ");
                        return;
                      }

                      setGeneratingNow(true);
                      setError(null);

                      const res = await fetch("/api/portal/blogs/automation/generate-now", { method: "POST" });
                      const json = (await res.json().catch(() => ({}))) as any;

                      if (res.status === 402 && json?.code === "INSUFFICIENT_CREDITS") {
                        setGeneratingNow(false);
                        setError(json?.error ?? "Not enough credits.");
                        return;
                      }

                      if (!res.ok || !json?.ok || !json?.postId) {
                        setGeneratingNow(false);
                        setError(json?.error ?? "Unable to generate a post right now.");
                        return;
                      }

                      window.location.href = `/portal/app/services/blogs/${json.postId}`;
                    }}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {generatingNow ? "Generating…" : "Generate next post now"}
                  </button>

                  {automation ? (
                    <div className="mt-2 space-y-1 text-xs text-zinc-600">
                      <div>Last generated: {automation.lastGeneratedAt ? formatDate(automation.lastGeneratedAt) : "—"}</div>
                      <div>Next due: {automation.nextDueAt ? formatDate(automation.nextDueAt) : "—"}</div>
                      <div>Scheduler last ran: {automation.lastRunAt ? formatDate(automation.lastRunAt) : "—"}</div>
                      <div className="text-zinc-500">Scheduler checks about hourly. If Next due is in the past, a new post should appear within ~1 hour.</div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
