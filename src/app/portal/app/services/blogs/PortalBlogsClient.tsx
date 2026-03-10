"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { PortalBackToOnboardingLink } from "@/components/PortalBackToOnboardingLink";

export type BlogsTab = "posts" | "automation" | "settings";
type FrequencyUnit = "days" | "weeks" | "months";

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

type FunnelBuilderDomain = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED";
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

type PostConfirm =
  | { kind: "delete"; postId: string; title: string }
  | { kind: "archive"; postId: string; title: string; archived: boolean }
  | null;

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

function inferFrequencyPreset(days: number): { count: number; unit: FrequencyUnit } {
  const d = Math.min(30, Math.max(1, Math.floor(Number(days) || 7)));
  if (d === 30) return { count: 1, unit: "months" };
  if (d % 7 === 0) {
    const weeks = d / 7;
    if (weeks >= 1 && weeks <= 4) return { count: weeks, unit: "weeks" };
  }
  return { count: d, unit: "days" };
}

function clampFrequencyCount(count: number, unit: FrequencyUnit) {
  const c = Math.max(1, Math.floor(Number(count) || 1));
  if (unit === "weeks") return Math.min(4, c);
  if (unit === "months") return 1;
  return Math.min(30, c);
}

export function PortalBlogsClient({
  routeTab,
  onTabChange,
}: {
  routeTab: BlogsTab;
  onTabChange: (tab: BlogsTab) => void;
}) {
  const toast = useToast();
  const searchParams = useSearchParams();
  const fromOnboarding = (searchParams?.get("from") || "").trim().toLowerCase() === "onboarding";

  function withFromOnboarding(href: string) {
    if (!fromOnboarding) return href;
    if (!href) return href;
    if (href.includes("from=onboarding")) return href;
    return href.includes("?") ? `${href}&from=onboarding` : `${href}?from=onboarding`;
  }

  const [me, setMe] = useState<Me | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [funnelDomains, setFunnelDomains] = useState<FunnelBuilderDomain[] | null>(null);
  const [funnelDomainsBusy, setFunnelDomainsBusy] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [credits, setCredits] = useState<number | null>(null);
  const [billingPath, setBillingPath] = useState<string>("/portal/app/billing");
  const [blogCreditsUsed30d, setBlogCreditsUsed30d] = useState<number | null>(null);
  const [blogGenerations30d, setBlogGenerations30d] = useState<number | null>(null);
  const [generatingNow, setGeneratingNow] = useState(false);

  const [siteName, setSiteName] = useState("");
  const [siteSlug, setSiteSlug] = useState("");
  const [siteDomain, setSiteDomain] = useState("");
  const [siteSaving, setSiteSaving] = useState(false);
  const [openPostMenu, setOpenPostMenu] = useState<null | { postId: string; left: number; top: number }>(null);
  const [openPreviewMenu, setOpenPreviewMenu] = useState<null | { left: number; top: number }>(null);
  const [confirm, setConfirm] = useState<PostConfirm>(null);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoFrequencyCount, setAutoFrequencyCount] = useState(1);
  const [autoFrequencyUnit, setAutoFrequencyUnit] = useState<FrequencyUnit>("weeks");
  const [autoTopics, setAutoTopics] = useState<string[]>([]);
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

  const domainStatus = useMemo(() => {
    const d = String(siteDomain || "").trim().toLowerCase();
    if (!d) return null as FunnelBuilderDomain["status"] | null;
    const match = (funnelDomains || []).find((x) => String(x.domain || "").trim().toLowerCase() === d) ?? null;
    return match?.status ?? null;
  }, [funnelDomains, siteDomain]);

  const savedDomainStatus = useMemo(() => {
    const d = String(site?.primaryDomain || "").trim().toLowerCase();
    if (!d) return null as FunnelBuilderDomain["status"] | null;
    const match = (funnelDomains || []).find((x) => String(x.domain || "").trim().toLowerCase() === d) ?? null;
    return match?.status ?? null;
  }, [funnelDomains, site?.primaryDomain]);

  const domainOptions = useMemo(() => {
    const base: PortalListboxOption<string>[] = [{ value: "", label: "No custom domain" }];
    const items = (funnelDomains || []).map((d) => ({
      value: d.domain,
      label: d.domain,
      hint: d.status === "PENDING" ? "Pending DNS verification" : undefined,
    }));
    return [...base, ...items];
  }, [funnelDomains]);

  const entitled = Boolean(me?.entitlements?.blog);

  const siteHandle = useMemo(() => site?.slug ?? site?.id ?? null, [site?.id, site?.slug]);
  const hostedBlogPath = siteHandle ? `/${siteHandle}/blogs` : null;

  const customBlogUrl = useMemo(() => {
    const d = siteDomain ? String(siteDomain).trim() : "";
    if (!d) return null;
    return `https://${d}/blogs`;
  }, [siteDomain]);

  const previewBlogsHref = useMemo(() => {
    if (site?.primaryDomain && savedDomainStatus === "VERIFIED") return `https://${site.primaryDomain}/blogs`;
    return hostedBlogPath;
  }, [hostedBlogPath, savedDomainStatus, site?.primaryDomain]);

  const openPostMenuPost = useMemo(() => {
    if (!openPostMenu) return null;
    return posts.find((p) => p.id === openPostMenu.postId) ?? null;
  }, [openPostMenu, posts]);

  const publicBlogUrlPreview = useMemo(() => {
    const handle = siteSlug.trim() || site?.slug || site?.id;
    if (!handle) return null;
    if (typeof window === "undefined") return `/${handle}/blogs`;
    return `${window.location.origin}/${handle}/blogs`;
  }, [site?.id, site?.slug, siteSlug]);

  const autoFrequencyDays = useMemo(() => {
    const unit = autoFrequencyUnit;
    const count = clampFrequencyCount(autoFrequencyCount, unit);
    if (unit === "weeks") return Math.min(30, Math.max(1, count * 7));
    if (unit === "months") return 30;
    return Math.min(30, Math.max(1, count));
  }, [autoFrequencyCount, autoFrequencyUnit]);

  const creditsPerWeekEstimate = useMemo(() => {
    const freq = Math.max(1, Math.floor(Number(autoFrequencyDays) || 7));
    const postsPerWeek = Math.ceil(7 / freq);
    return Math.max(0, postsPerWeek - 1);
  }, [autoFrequencyDays]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFunnelDomainsBusy(true);
    try {
      const [meRes, siteRes, postsRes, autoRes, creditsRes, usageRes, domainsRes] = await Promise.all([
        fetch("/api/customer/me", {
          cache: "no-store",
          headers: {
            "x-pa-app": "portal",
            "x-portal-variant": typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "credit" : "portal",
          },
        }),
        fetch("/api/portal/blogs/site", { cache: "no-store" }),
        fetch("/api/portal/blogs/posts?take=100", { cache: "no-store" }),
        fetch("/api/portal/blogs/automation/settings", { cache: "no-store" }),
        fetch("/api/portal/credits", { cache: "no-store" }),
        fetch("/api/portal/blogs/usage?range=30d", { cache: "no-store" }),
        fetch("/api/portal/funnel-builder/domains", { cache: "no-store" }),
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
      const domainsJson = (await domainsRes.json().catch(() => ({}))) as { domains?: FunnelBuilderDomain[] };

      if (!meRes.ok) {
        setError((meJson as { error?: string })?.error ?? "Unable to load account");
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
      setSiteDomain(s?.primaryDomain ?? "");

      if (domainsRes.ok) {
        setFunnelDomains(Array.isArray(domainsJson.domains) ? (domainsJson.domains as FunnelBuilderDomain[]) : []);
      } else {
        setFunnelDomains([]);
      }

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
        const preset = inferFrequencyPreset(autoJson.settings.frequencyDays);
        setAutoFrequencyUnit(preset.unit);
        setAutoFrequencyCount(preset.count);
        setAutoTopics(sanitizeTopics((autoJson.settings.topics ?? []) as any));
        setAutoPublish(Boolean(autoJson.settings.autoPublish));
      }
    } finally {
      setFunnelDomainsBusy(false);
      setLoading(false);
    }
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
    if (!openPostMenu) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPostMenu(null);
    };

    const onScrollOrResize = () => setOpenPostMenu(null);

    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [openPostMenu]);

  useEffect(() => {
    if (!openPreviewMenu) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPreviewMenu(null);
    };

    const onScrollOrResize = () => setOpenPreviewMenu(null);

    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [openPreviewMenu]);

  function togglePostMenu(postId: string, el: HTMLElement) {
    setOpenPostMenu((prev) => {
      if (prev?.postId === postId) return null;
      const rect = el.getBoundingClientRect();
      const menuWidth = 224; // w-56
      const padding = 8;
      const left = Math.max(padding, Math.min(window.innerWidth - menuWidth - padding, rect.right - menuWidth));
      const top = Math.max(padding, rect.bottom + 8);
      return { postId, left, top };
    });
  }

  function togglePreviewMenu(el: HTMLElement) {
    setOpenPreviewMenu((prev) => {
      if (prev) return null;
      const rect = el.getBoundingClientRect();
      const menuWidth = 288; // w-72
      const padding = 8;
      const left = Math.max(padding, Math.min(window.innerWidth - menuWidth - padding, rect.right - menuWidth));
      const top = Math.max(padding, rect.bottom + 8);
      return { left, top };
    });
  }

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirm(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm]);

  async function archivePost(postId: string, archived: boolean) {
    setError(null);
    const res = await fetch(`/api/portal/blogs/posts/${postId}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to update archive state");
      return;
    }
    await refreshAll();
  }

  async function deletePost(postId: string) {
    setError(null);
    const res = await fetch(`/api/portal/blogs/posts/${postId}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to delete post");
      return;
    }
    await refreshAll();
  }

  async function createSite() {
    setSiteSaving(true);
    setError(null);

    const res = await fetch("/api/portal/blogs/site", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: siteName || "My Blog", slug: siteSlug, primaryDomain: siteDomain }),
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
    setSiteDomain(json.site.primaryDomain ?? "");
    await refreshAll();
  }

  async function saveSite() {
    const nextName = siteName.trim() ? siteName : "My Blog";

    setSiteSaving(true);
    setError(null);

    const res = await fetch("/api/portal/blogs/site", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        slug: siteSlug,
        primaryDomain: siteDomain,
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
    setSiteDomain(json.site.primaryDomain ?? "");
    await refreshAll();
  }

  async function newDraft() {
    if (!site) {
      setError("Create your blog workspace first (Settings → Create blog workspace).");
      onTabChange("settings");
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
        <PortalBackToOnboardingLink />
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Loading blogs…
        </div>
      </div>
    );
  }

  if (!entitled) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <PortalBackToOnboardingLink />
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="text-sm font-semibold text-zinc-900">Automated Blogs</div>
          <div className="mt-2 text-sm text-zinc-600">
            Publish consistent, SEO-ready posts without writing every week.
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="text-sm font-semibold text-zinc-900">Why teams turn this on</div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Fill your site with content that matches your offers and brand voice</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Keep momentum with automation (set the cadence, review before publishing)</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Build trust with prospects before they ever book a call</span></li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={withFromOnboarding("/portal/app/billing?buy=blog&autostart=1")}
              className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Unlock in Billing
            </Link>
            <Link
              href={withFromOnboarding("/portal/app/services")}
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
      <PortalBackToOnboardingLink />
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Blogs</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Draft posts here, then publish them on your own website.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a
            href={previewBlogsHref ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={
              "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 " +
              (!previewBlogsHref ? "pointer-events-none opacity-60" : "")
            }
          >
            Preview blogs page
          </a>
          <button
            type="button"
            onClick={newDraft}
            aria-label="New blog"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            <span className="text-lg leading-none">+</span>
            <span>New blog</span>
          </button>
        </div>
      </div>

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onTabChange("posts")}
          aria-current={routeTab === "posts" ? "page" : undefined}
          className={
            "flex-1 min-w-[140px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (routeTab === "posts"
              ? "border-[color:var(--color-brand-blue)] bg-[color:var(--color-brand-blue)] text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Posts
        </button>
        <button
          type="button"
          onClick={() => onTabChange("automation")}
          aria-current={routeTab === "automation" ? "page" : undefined}
          className={
            "flex-1 min-w-[140px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (routeTab === "automation"
              ? "border-[color:var(--color-brand-pink)] bg-[color:var(--color-brand-pink)] text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Blog Automation
        </button>
        <button
          type="button"
          onClick={() => onTabChange("settings")}
          aria-current={routeTab === "settings" ? "page" : undefined}
          className={
            "flex-1 min-w-[140px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (routeTab === "settings"
              ? "border-brand-ink bg-brand-ink text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Settings
        </button>
      </div>

      {routeTab === "posts" ? (
        <>
          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Your posts</div>
                <div className="mt-2 text-sm text-zinc-600">Edit drafts, export Markdown, and keep everything organized.</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-zinc-600">Total credits</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">{credits === null ? "N/A" : credits.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-zinc-600">Blog credits used</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">
                  {blogCreditsUsed30d === null ? "N/A" : blogCreditsUsed30d.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Last 30 days · {blogGenerations30d === null ? "N/A" : blogGenerations30d} generation{blogGenerations30d === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {posts.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-zinc-600" colSpan={4}>
                        No posts yet. Click “New blog” to start.
                      </td>
                    </tr>
                  ) : (
                    posts.map((p) => {
                      const statusLabel = p.archivedAt ? "Archived" : p.status === "PUBLISHED" ? "Published" : "Draft";
                      const statusClasses = p.archivedAt
                        ? "bg-zinc-100 text-zinc-700"
                        : p.status === "PUBLISHED"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-700";

                      return (
                        <tr key={p.id} className="border-t border-zinc-200">
                          <td className="px-4 py-3">
                            <Link href={`/portal/app/services/blogs/${p.id}`} className="font-semibold text-brand-ink hover:underline">
                              {p.title || "Untitled"}
                            </Link>
                            <div className="mt-1 truncate text-xs text-zinc-500">/{p.slug}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={"inline-flex rounded-full px-2 py-1 text-xs font-semibold " + statusClasses}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{formatDate(p.updatedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="relative flex justify-end" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                aria-label="Post actions"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-lg font-semibold text-zinc-700 hover:bg-zinc-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePostMenu(p.id, e.currentTarget);
                                }}
                              >
                                ⋯
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
              Your website publishing is up to you (WordPress, Webflow, Shopify, etc.). We’ll keep drafts exportable.
            </div>
          </div>
        </>
      ) : null}

      {routeTab === "automation" ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Blog automation schedule</div>
          <div className="mt-2 text-sm text-zinc-600">Set it once, and we’ll generate posts on schedule.</div>

          <div className="mt-5 space-y-4">
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
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="number"
                  min={1}
                  max={autoFrequencyUnit === "weeks" ? 4 : autoFrequencyUnit === "months" ? 1 : 30}
                  value={autoFrequencyCount}
                  onChange={(e) => setAutoFrequencyCount(clampFrequencyCount(Number(e.target.value), autoFrequencyUnit))}
                  disabled={autoFrequencyUnit === "months"}
                  className="w-28 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300 disabled:bg-zinc-50"
                />
                <select
                  value={autoFrequencyUnit}
                  onChange={(e) => {
                    const nextUnit = (e.target.value as FrequencyUnit) || "days";
                    setAutoFrequencyUnit(nextUnit);
                    setAutoFrequencyCount((prev) => clampFrequencyCount(prev, nextUnit));
                  }}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300 sm:w-44"
                >
                  <option value="days">day(s)</option>
                  <option value="weeks">week(s)</option>
                  <option value="months">month(s)</option>
                </select>
                <div className="text-sm text-zinc-600">per post</div>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Max is 30 days. Weekly = 1 week · Biweekly = 2 weeks · Monthly = 1 month.
              </div>
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

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveAutomation}
                disabled={autoSaving}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {autoSaving ? "Saving…" : "Save automation"}
              </button>

              <button
                type="button"
                disabled={generatingNow || !site}
                onClick={async () => {
                  if (!site) {
                    setError("Create your blog workspace first (Settings → Create blog workspace).");
                    onTabChange("settings");
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
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[color:var(--color-brand-blue)] to-[color:var(--color-brand-pink)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {generatingNow ? "Generating…" : "Generate next post now"}
              </button>
            </div>

            {automation ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
                <div>Last generated: {automation.lastGeneratedAt ? formatDate(automation.lastGeneratedAt) : "N/A"}</div>
                <div>Next due: {automation.nextDueAt ? formatDate(automation.nextDueAt) : "N/A"}</div>
                <div>Scheduler last ran: {automation.lastRunAt ? formatDate(automation.lastRunAt) : "N/A"}</div>
                <div className="mt-1 text-zinc-500">Scheduler checks about hourly. If Next due is in the past, a new post should appear within ~1 hour.</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {routeTab === "settings" ? (
        <div className="mt-6">
          <PortalSettingsSection
            title="Blog settings"
            description="Configure your hosted blog link and workspace."
            accent="slate"
            defaultOpen={true}
            collapsible={false}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                  placeholder="Purely Automation"
                />
                <div className="mt-1 text-xs text-zinc-500">
                  Your public blog will be at {publicBlogUrlPreview ?? "…"}. Leave blank to use your business name.
                </div>
              </div>
            </div>

            <div className="mt-5">
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
                <button
                  type="button"
                  onClick={(e) => togglePreviewMenu(e.currentTarget)}
                  disabled={
                    !hostedBlogPath &&
                    !(site?.primaryDomain && savedDomainStatus === "VERIFIED") &&
                    !(siteDomain.trim() && domainStatus === "VERIFIED")
                  }
                  className={
                    "inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  }
                >
                  Preview
                  <span aria-hidden className="text-xs">▾</span>
                </button>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                This is your public blog hosted on Purely Automation. If you also want to publish elsewhere, use “Export Markdown”.
              </div>
            </div>

            <div className="mt-6">
              <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Custom domain (optional)</div>
                  <div className="mt-1 text-xs text-zinc-500">Pulls from Funnel Builder → Settings → Custom domains.</div>
                </div>
                {siteDomain.trim() ? (
                  <span
                    className={
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                      (domainStatus === "VERIFIED" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700")
                    }
                  >
                    {domainStatus === "VERIFIED" ? "Verified" : domainStatus === "PENDING" ? "Pending" : "Not verified"}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Domain</label>
                  <div className="mt-1">
                    <PortalListboxDropdown<string>
                      value={siteDomain}
                      disabled={siteSaving || !funnelDomains || funnelDomainsBusy}
                      options={domainOptions}
                      onChange={(v) => setSiteDomain(String(v || ""))}
                      placeholder={
                        funnelDomainsBusy
                          ? "Loading domains…"
                          : (funnelDomains || []).length
                            ? "Choose a domain"
                            : "No domains yet"
                      }
                    />
                  </div>

                  <div className="mt-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="text-xs text-zinc-500">
                      {!site ? "Pick a domain now and it will be applied when you create your blog workspace." : "Manage domains in Funnel Builder."}
                    </div>
                    <Link
                      href="/portal/app/services/funnel-builder/settings"
                      className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
                    >
                      Add / manage domains
                    </Link>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600">Custom domain preview</label>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                      <div className="truncate">{customBlogUrl ?? "Select a domain"}</div>
                    </div>
                    <a
                      href={site?.primaryDomain && savedDomainStatus === "VERIFIED" ? `https://${site.primaryDomain}/blogs` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={
                        "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 " +
                        (site?.primaryDomain && savedDomainStatus === "VERIFIED" ? "" : "pointer-events-none opacity-60")
                      }
                    >
                      Preview
                    </a>
                  </div>
                  {site?.primaryDomain && savedDomainStatus === "PENDING" ? (
                    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      This domain is pending verification in Funnel Builder.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {!site ? (
                <button
                  type="button"
                  onClick={createSite}
                  disabled={siteSaving}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {siteSaving ? "Creating…" : "Create blog workspace"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={saveSite}
                  disabled={siteSaving}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {siteSaving ? "Saving…" : "Save settings"}
                </button>
              )}
            </div>
          </PortalSettingsSection>
        </div>
      ) : null}

      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-8"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-zinc-900">
              {confirm.kind === "delete" ? "Delete post permanently?" : confirm.archived ? "Archive this post?" : "Unarchive this post?"}
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              {confirm.kind === "delete"
                ? `This will permanently delete “${confirm.title}”.`
                : confirm.archived
                  ? `Archived posts won’t show up on your public blog. (${confirm.title})`
                  : `This will restore “${confirm.title}” back to your list.`}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>

              {confirm.kind === "delete" ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  onClick={async () => {
                    const postId = confirm.postId;
                    setConfirm(null);
                    await deletePost(postId);
                  }}
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  onClick={async () => {
                    const postId = confirm.postId;
                    const nextArchived = confirm.archived;
                    setConfirm(null);
                    await archivePost(postId, nextArchived);
                  }}
                >
                  {confirm.archived ? "Archive" : "Unarchive"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {openPostMenu && openPostMenuPost && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50" aria-hidden>
              <div className="absolute inset-0" onMouseDown={() => setOpenPostMenu(null)} onTouchStart={() => setOpenPostMenu(null)} />
              <div
                className="fixed z-[60] w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
                style={{ left: openPostMenu.left, top: openPostMenu.top }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {(() => {
                  const p = openPostMenuPost;
                  const livePath = site?.verifiedAt && site?.primaryDomain
                    ? `https://${site.primaryDomain}/blogs/${p.slug}`
                    : siteHandle
                      ? `/${siteHandle}/blogs/${p.slug}`
                      : null;
                  const canViewLive = Boolean(livePath) && p.status === "PUBLISHED" && !p.archivedAt;

                  return (
                    <>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                        onClick={() => {
                          setOpenPostMenu(null);
                          window.location.href = `/portal/app/services/blogs/${p.id}`;
                        }}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        disabled={!canViewLive}
                        className={
                          "w-full px-4 py-3 text-left text-sm font-semibold hover:bg-zinc-50 " +
                          (canViewLive ? "text-zinc-900" : "text-zinc-400")
                        }
                        onClick={() => {
                          if (!canViewLive || !livePath) return;
                          setOpenPostMenu(null);
                          window.open(livePath, "_blank", "noopener,noreferrer");
                        }}
                      >
                        View live
                      </button>

                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        onClick={() => {
                          setOpenPostMenu(null);
                          setConfirm({
                            kind: "archive",
                            postId: p.id,
                            title: p.title || "Untitled",
                            archived: !Boolean(p.archivedAt),
                          });
                        }}
                      >
                        {p.archivedAt ? "Unarchive" : "Archive"}
                      </button>

                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setOpenPostMenu(null);
                          setConfirm({ kind: "delete", postId: p.id, title: p.title || "Untitled" });
                        }}
                      >
                        Delete
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>,
            document.body,
          )
        : null}

      {openPreviewMenu && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50" aria-hidden>
              <div className="absolute inset-0" onMouseDown={() => setOpenPreviewMenu(null)} onTouchStart={() => setOpenPreviewMenu(null)} />
              <div
                className="fixed z-[60] w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
                style={{ left: openPreviewMenu.left, top: openPreviewMenu.top }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {(() => {
                  const items: Array<{
                    label: string;
                    href: string | null;
                    hint?: string;
                    disabled?: boolean;
                  }> = [];

                  items.push({
                    label: "Hosted preview (Purely Automation)",
                    href: hostedBlogPath,
                    disabled: !hostedBlogPath,
                    hint: hostedBlogPath ? hostedBlogPath : "Create your blog workspace to get a hosted link",
                  });

                  if (site?.primaryDomain) {
                    items.push({
                      label: `Custom domain (saved): ${site.primaryDomain}`,
                      href: savedDomainStatus === "VERIFIED" ? `https://${site.primaryDomain}/blogs` : null,
                      disabled: savedDomainStatus !== "VERIFIED",
                      hint:
                        savedDomainStatus === "VERIFIED"
                          ? "Live"
                          : savedDomainStatus === "PENDING"
                            ? "Pending DNS verification"
                            : "Not verified",
                    });
                  }

                  const selected = siteDomain.trim();
                  const selectedIsDifferent = selected && selected !== (site?.primaryDomain ?? "");
                  if (selected && selectedIsDifferent) {
                    items.push({
                      label: `Custom domain (selected): ${selected}`,
                      href: domainStatus === "VERIFIED" ? `https://${selected}/blogs` : null,
                      disabled: domainStatus !== "VERIFIED",
                      hint:
                        domainStatus === "VERIFIED"
                          ? "Selected (not saved)"
                          : domainStatus === "PENDING"
                            ? "Pending DNS verification"
                            : "Not verified",
                    });
                  }

                  return (
                    <div className="py-1">
                      {items.map((it) => (
                        <button
                          key={it.label}
                          type="button"
                          disabled={Boolean(it.disabled) || !it.href}
                          className={
                            "flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                          }
                          onClick={() => {
                            if (!it.href) return;
                            setOpenPreviewMenu(null);
                            window.open(it.href, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <div className="font-semibold text-zinc-900">{it.label}</div>
                          {it.hint ? <div className="text-xs text-zinc-500">{it.hint}</div> : null}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
