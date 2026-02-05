"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
  billing: { configured: boolean };
};

type Site = {
  id: string;
  name: string;
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
};

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

  const [siteName, setSiteName] = useState("");
  const [domain, setDomain] = useState("");
  const [siteSaving, setSiteSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoFrequencyDays, setAutoFrequencyDays] = useState(7);
  const [autoTopicsText, setAutoTopicsText] = useState("");
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

  const entitled = Boolean(me?.entitlements?.blog);

  const verification = useMemo(() => {
    if (!site?.primaryDomain) return null;
    return {
      recordName: `_purelyautomation.${site.primaryDomain}`,
      expected: `verify=${site.verificationToken}`,
    };
  }, [site?.primaryDomain, site?.verificationToken]);

  function topicsTextToArray(text: string): string[] {
    const raw = String(text || "")
      .split(/\n|,/g)
      .map((x) => x.trim())
      .filter(Boolean);
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

  function topicsArrayToText(items: string[]): string {
    return Array.isArray(items) ? items.join("\n") : "";
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
    } catch {
      setError("Unable to copy. Your browser may block clipboard access.");
    }
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);

    const [meRes, siteRes, postsRes, autoRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store" }),
      fetch("/api/portal/blogs/site", { cache: "no-store" }),
      fetch("/api/portal/blogs/posts?take=100", { cache: "no-store" }),
      fetch("/api/portal/blogs/automation/settings", { cache: "no-store" }),
    ]);

    const meJson = (await meRes.json().catch(() => ({}))) as Partial<Me>;
    const siteJson = (await siteRes.json().catch(() => ({}))) as { site?: Site | null; error?: string };
    const postsJson = (await postsRes.json().catch(() => ({}))) as { posts?: PostRow[]; error?: string };
    const autoJson = (await autoRes.json().catch(() => ({}))) as { settings?: AutomationSettings; error?: string };

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
    setDomain(s?.primaryDomain ?? "");

    setPosts(Array.isArray(postsJson.posts) ? postsJson.posts : []);

    if (autoRes.ok && autoJson.settings) {
      setAutomation(autoJson.settings);
      setAutoEnabled(Boolean(autoJson.settings.enabled));
      setAutoFrequencyDays(
        typeof autoJson.settings.frequencyDays === "number" && Number.isFinite(autoJson.settings.frequencyDays)
          ? autoJson.settings.frequencyDays
          : 7,
      );
      setAutoTopicsText(topicsArrayToText(autoJson.settings.topics ?? []));
      setAutoPublish(Boolean(autoJson.settings.autoPublish));
    }

    setLoading(false);
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function createSite() {
    setSiteSaving(true);
    setError(null);

    const res = await fetch("/api/portal/blogs/site", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: siteName || "My Blog", primaryDomain: domain }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; site?: Site; error?: string };
    setSiteSaving(false);

    if (!res.ok || !json.ok || !json.site) {
      setError(json.error ?? "Unable to create blog site");
      return;
    }

    setSite(json.site);
    setSiteName(json.site.name);
    setDomain(json.site.primaryDomain ?? "");
    await refreshAll();
  }

  async function saveSite() {
    if (!siteName.trim()) return;

    setSiteSaving(true);
    setError(null);

    const res = await fetch("/api/portal/blogs/site", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: siteName, primaryDomain: domain }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; site?: Site; error?: string };
    setSiteSaving(false);

    if (!res.ok || !json.ok || !json.site) {
      setError(json.error ?? "Unable to save blog settings");
      return;
    }

    setSite(json.site);
    await refreshAll();
  }

  async function verifyDomain() {
    if (!site?.primaryDomain) return;

    setVerifying(true);
    setError(null);

    const res = await fetch("/api/portal/blogs/site/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: site.primaryDomain }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; verified?: boolean; error?: string };
    setVerifying(false);

    if (!res.ok) {
      setError((json as { error?: string })?.error ?? "Unable to verify domain");
      return;
    }

    if (!json.verified) {
      setError(json.error ?? "TXT record not found yet (DNS can take a bit to propagate)");
      return;
    }

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

    const topics = topicsTextToArray(autoTopicsText);
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

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Blog settings</div>
          <div className="mt-2 text-sm text-zinc-600">Name, optional domain, and automation schedule.</div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Blog name</label>
              <input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="My Company Blog"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Custom domain (optional)</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                placeholder="blog.example.com"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Optional. If you want to prove you own this domain (and prep for hosted publishing later), add the TXT record below and verify.
                If you’re publishing on WordPress/Webflow/Shopify/etc., you can skip this.
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

              {site?.primaryDomain && verification ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-600">DNS verification</div>
                  <div className="mt-2 text-xs text-zinc-600">Add this TXT record:</div>
                  <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-zinc-500">Name</div>
                      <button
                        type="button"
                        onClick={() => copy(verification.recordName)}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-brand-ink hover:bg-zinc-50"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="mt-0.5 break-all font-mono text-zinc-900">{verification.recordName}</div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-zinc-500">Value</div>
                      <button
                        type="button"
                        onClick={() => copy(verification.expected)}
                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-brand-ink hover:bg-zinc-50"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="mt-0.5 break-all font-mono text-zinc-900">{verification.expected}</div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-600">
                      Status: {site.verifiedAt ? <span className="font-semibold text-emerald-700">Verified</span> : <span className="font-semibold">Not verified</span>}
                    </div>
                    <button
                      type="button"
                      onClick={verifyDomain}
                      disabled={verifying}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {verifying ? "Checking…" : "Verify"}
                    </button>
                  </div>

                  <div className="mt-3 text-xs text-zinc-500">
                    DNS can take a few minutes to propagate. We recommend Vercel for simple hosting (free tier), but this verification works with any DNS provider.
                  </div>
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Automation schedule</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Set it once, and we’ll generate posts on schedule. You can export to anywhere.
                </div>

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
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Topics (optional)</label>
                    <textarea
                      value={autoTopicsText}
                      onChange={(e) => setAutoTopicsText(e.target.value)}
                      className="mt-1 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="Local SEO tips\nHow to choose a contractor\nCommon mistakes customers make"
                    />
                    <div className="mt-1 text-xs text-zinc-500">One per line (or comma-separated).</div>
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

                  {automation ? (
                    <div className="mt-2 text-xs text-zinc-600">
                      Next due: {automation.nextDueAt ? formatDate(automation.nextDueAt) : "—"}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
