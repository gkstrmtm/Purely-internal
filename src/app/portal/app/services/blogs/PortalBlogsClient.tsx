"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { PortalBackToOnboardingLink } from "@/components/PortalBackToOnboardingLink";
import { InlineSpinner } from "@/components/InlineSpinner";
import { buildFontDropdownOptions } from "@/lib/portalHostedFonts";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import { IconEdit } from "@/app/portal/PortalIcons";

export type BlogsTab = "posts" | "automation" | "settings";
function currentAppBase(pathname: string | null | undefined) {
  return String(pathname || "").startsWith("/credit") ? "/credit/app" : "/portal/app";
}

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

type BlogAppearance = {
  version: 1;
  useBrandFont: boolean;
  titleFontKey: string;
  bodyFontKey: string;
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

function previewText(value: string | null | undefined, maxLen = 240) {
  const raw = typeof value === "string" ? value : "";
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).trimEnd() + "…";
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
  const pathname = usePathname();
  const appBase = currentAppBase(pathname);
  const searchParams = useSearchParams();
  const fromOnboarding = (searchParams?.get("from") || "").trim().toLowerCase() === "onboarding";

  const isPaMobileApp = useMemo(() => {
    const byParam = (searchParams?.get("pa_mobileapp") || "").trim() === "1";
    if (typeof window === "undefined") return byParam;
    const byHost = String(window.location.hostname || "").toLowerCase().includes("purely-mobile");
    return byParam || byHost;
  }, [searchParams]);

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
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const [appearance, setAppearance] = useState<BlogAppearance | null>(null);
  const [appearanceSaving, setAppearanceSaving] = useState(false);

  const [funnelDomains, setFunnelDomains] = useState<FunnelBuilderDomain[] | null>(null);
  const [funnelDomainsBusy, setFunnelDomainsBusy] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [credits, setCredits] = useState<number | null>(null);
  const [blogCreditsUsed30d, setBlogCreditsUsed30d] = useState<number | null>(null);
  const [blogGenerations30d, setBlogGenerations30d] = useState<number | null>(null);
  const [generatingNow, setGeneratingNow] = useState(false);

  const [siteName, setSiteName] = useState("");
  const [siteSlug, setSiteSlug] = useState("");
  const [siteDomain, setSiteDomain] = useState("");
  const [siteSaving, setSiteSaving] = useState(false);
  const lastSavedSiteSigRef = useRef<string>("");
  const [openPostMenu, setOpenPostMenu] = useState<null | { postId: string; left: number; top: number; maxHeight: number }>(null);
  const [openPreviewMenu, setOpenPreviewMenu] = useState<null | { left: number; top: number }>(null);
  const [confirm, setConfirm] = useState<PostConfirm>(null);

  const siteSig = useMemo(() => {
    const nextName = siteName.trim() ? siteName.trim() : "My Blog";
    return JSON.stringify({ name: nextName, slug: siteSlug.trim(), primaryDomain: siteDomain.trim() });
  }, [siteDomain, siteName, siteSlug]);
  const siteDirty = siteSig !== lastSavedSiteSigRef.current;

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoFrequencyCount, setAutoFrequencyCount] = useState(1);
  const [autoFrequencyUnit, setAutoFrequencyUnit] = useState<FrequencyUnit>("weeks");
  const [autoTopics, setAutoTopics] = useState<string[]>([]);
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const lastSavedAutoSigRef = useRef<string>("");

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

  const fontOptions = useMemo(() => {
    return buildFontDropdownOptions() as PortalListboxOption<string>[];
  }, []);

  const entitled = Boolean(me?.entitlements?.blog);

  const siteHandle = useMemo(() => site?.slug ?? site?.id ?? null, [site?.id, site?.slug]);
  const hostedBlogPath = siteHandle ? `/${siteHandle}/blogs` : null;

  const customBlogUrl = useMemo(() => {
    const d = siteDomain ? String(siteDomain).trim() : "";
    if (!d) return null;
    return `https://${d}/blogs`;
  }, [siteDomain]);

  const previewBlogsHref = useMemo(() => {
    // Preview is always the Purely Automation hosted page.
    return hostedBlogPath ? toPurelyHostedUrl(hostedBlogPath) : null;
  }, [hostedBlogPath]);

  const liveBlogsHref = useMemo(() => {
    // Live prefers the verified custom domain, otherwise falls back to the hosted preview.
    if (site?.primaryDomain && savedDomainStatus === "VERIFIED") return `https://${site.primaryDomain}/blogs`;
    return hostedBlogPath ? toPurelyHostedUrl(hostedBlogPath) : null;
  }, [hostedBlogPath, savedDomainStatus, site?.primaryDomain]);

  const setSidebarOverride = useSetPortalSidebarOverride();
  const blogsSidebar = useMemo(() => {
    return (
      <div className="space-y-4">
        <div>
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Blogs</div>
          <div className="mt-2 space-y-2">
            {([
              { key: "posts", label: "Posts", tone: "border-(--color-brand-blue) bg-(--color-brand-blue) text-white shadow-sm" },
              { key: "automation", label: "Blog Automation", tone: "border-(--color-brand-pink) bg-(--color-brand-pink) text-white shadow-sm" },
              { key: "settings", label: "Settings", tone: "border-brand-ink bg-brand-ink text-white shadow-sm" },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                aria-current={routeTab === item.key ? "page" : undefined}
                className={
                  "w-full rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                  (routeTab === item.key ? item.tone : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-3">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Links</div>
          <div className="mt-2 space-y-2">
            <a
              href={previewBlogsHref ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={
                "block rounded-2xl border px-3 py-2.5 text-sm font-semibold transition " +
                (previewBlogsHref
                  ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  : "pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-400")
              }
            >
              Preview
            </a>
            <a
              href={liveBlogsHref ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={
                "block rounded-2xl border px-3 py-2.5 text-sm font-semibold transition " +
                (liveBlogsHref
                  ? "border-(--color-brand-blue) bg-(--color-brand-blue) text-white hover:opacity-95"
                  : "pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-400")
              }
            >
              Live
            </a>
          </div>
        </div>
      </div>
    );
  }, [liveBlogsHref, onTabChange, previewBlogsHref, routeTab]);

  useEffect(() => {
    if (!entitled) return;
    setSidebarOverride({
      desktopSidebarContent: blogsSidebar,
      mobileSidebarContent: blogsSidebar,
    });
    return () => setSidebarOverride(null);
  }, [blogsSidebar, entitled, setSidebarOverride]);

  const openPostMenuPost = useMemo(() => {
    if (!openPostMenu) return null;
    return posts.find((p) => p.id === openPostMenu.postId) ?? null;
  }, [openPostMenu, posts]);

  const publicBlogUrlPreview = useMemo(() => {
    const handle = siteSlug.trim() || site?.slug || site?.id;
    if (!handle) return null;
    return toPurelyHostedUrl(`/${handle}/blogs`);
  }, [site?.id, site?.slug, siteSlug]);

  const liveBlogUrlPreview = useMemo(() => {
    if (site?.primaryDomain && savedDomainStatus === "VERIFIED") return `https://${site.primaryDomain}/blogs`;
    return publicBlogUrlPreview;
  }, [publicBlogUrlPreview, savedDomainStatus, site?.primaryDomain]);

  const autoFrequencyDays = useMemo(() => {
    const unit = autoFrequencyUnit;
    const count = clampFrequencyCount(autoFrequencyCount, unit);
    if (unit === "weeks") return Math.min(30, Math.max(1, count * 7));
    if (unit === "months") return 30;
    return Math.min(30, Math.max(1, count));
  }, [autoFrequencyCount, autoFrequencyUnit]);

  const autoTopicsSanitized = useMemo(() => sanitizeTopics(autoTopics), [autoTopics]);
  const autoSig = useMemo(() => {
    const frequencyDays = Math.min(30, Math.max(1, Math.floor(Number(autoFrequencyDays) || 7)));
    return JSON.stringify({
      enabled: Boolean(autoEnabled),
      frequencyDays,
      topics: autoTopicsSanitized,
      autoPublish: Boolean(autoPublish),
    });
  }, [autoEnabled, autoFrequencyDays, autoPublish, autoTopicsSanitized]);
  const autoDirty = autoSig !== lastSavedAutoSigRef.current;

  const creditsPerWeekEstimate = useMemo(() => {
    const freq = Math.max(1, Math.floor(Number(autoFrequencyDays) || 7));
    const postsPerWeek = Math.ceil(7 / freq);
    return Math.max(0, postsPerWeek - 1);
  }, [autoFrequencyDays]);

  const [automationStatusBusy, setAutomationStatusBusy] = useState(false);

  const refreshAutomationStatus = useCallback(async () => {
    // Refresh only the status fields so we don’t clobber in-progress edits
    // or throw the whole Blogs UI into a loading screen.
    setAutomationStatusBusy(true);
    try {
      const res = await fetch("/api/portal/blogs/automation/settings", { cache: "no-store" }).catch(() => null as any);
      if (!res?.ok) return;
      const json = (await res.json().catch(() => null)) as any;
      if (!json || json.ok !== true || !json.settings) return;

      const next = json.settings as AutomationSettings;
      setAutomation((prev) => {
        if (!prev) return next;
        return {
          ...prev,
          lastGeneratedAt: next.lastGeneratedAt ?? prev.lastGeneratedAt ?? null,
          nextDueAt: next.nextDueAt ?? prev.nextDueAt ?? null,
          lastRunAt: next.lastRunAt ?? prev.lastRunAt ?? null,
        };
      });
    } finally {
      setAutomationStatusBusy(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);
    setFunnelDomainsBusy(true);
    try {
      const [meRes, siteRes, postsRes, autoRes, creditsRes, usageRes, domainsRes, appearanceRes] = await Promise.all([
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
        fetch("/api/portal/blogs/appearance", { cache: "no-store" }),
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
      const appearanceJson = (await appearanceRes.json().catch(() => ({}))) as {
        ok?: boolean;
        appearance?: BlogAppearance;
        error?: string;
      };

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
      lastSavedSiteSigRef.current = JSON.stringify({
        name: (s?.name ?? "").trim() ? String(s?.name ?? "") : "My Blog",
        slug: String(s?.slug ?? "").trim(),
        primaryDomain: String(s?.primaryDomain ?? "").trim(),
      });

      if (domainsRes.ok) {
        setFunnelDomains(Array.isArray(domainsJson.domains) ? (domainsJson.domains as FunnelBuilderDomain[]) : []);
      } else {
        setFunnelDomains([]);
      }

      setPosts(Array.isArray(postsJson.posts) ? postsJson.posts : []);

      if (appearanceRes.ok && appearanceJson.ok && appearanceJson.appearance) {
        setAppearance(appearanceJson.appearance);
      } else {
        setAppearance((prev) => prev ?? { version: 1, useBrandFont: true, titleFontKey: "brand", bodyFontKey: "brand" });
      }

      if (creditsRes.ok) {
        setCredits(typeof creditsJson.credits === "number" && Number.isFinite(creditsJson.credits) ? creditsJson.credits : 0);
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
        const nextTopics = sanitizeTopics((autoJson.settings.topics ?? []) as any);
        setAutoTopics(nextTopics);
        setAutoPublish(Boolean(autoJson.settings.autoPublish));
        lastSavedAutoSigRef.current = JSON.stringify({
          enabled: Boolean(autoJson.settings.enabled),
          frequencyDays: Math.min(30, Math.max(1, Math.floor(Number(autoJson.settings.frequencyDays) || 7))),
          topics: nextTopics,
          autoPublish: Boolean(autoJson.settings.autoPublish),
        });
      }
    } finally {
      setFunnelDomainsBusy(false);
      if (!hasLoadedOnceRef.current) hasLoadedOnceRef.current = true;
      if (firstLoad) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  const saveAppearance = useCallback(
    async (next: Partial<BlogAppearance>) => {
      if (appearanceSaving) return;
      setAppearanceSaving(true);
      try {
        const res = await fetch("/api/portal/blogs/appearance", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; appearance?: BlogAppearance; error?: string };
        if (!res.ok || !json.ok || !json.appearance) {
          toast.error(json.error ?? "Unable to save blog fonts");
          return;
        }
        setAppearance(json.appearance);
      } finally {
        setAppearanceSaving(false);
      }
    },
    [appearanceSaving, toast],
  );

  useEffect(() => {
    void refreshAll();
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
      const VIEWPORT_PAD = 12;
      const GAP = 8;
      const EST_HEIGHT = 260;

      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      const left = Math.max(VIEWPORT_PAD, Math.min(viewportW - menuWidth - VIEWPORT_PAD, rect.right - menuWidth));

      const spaceBelow = viewportH - rect.bottom - GAP - VIEWPORT_PAD;
      const spaceAbove = rect.top - GAP - VIEWPORT_PAD;
      const placeDown = spaceBelow >= Math.min(EST_HEIGHT, 220) || spaceBelow >= spaceAbove;

      const available = placeDown ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(140, Math.min(EST_HEIGHT, available));
      const usedHeight = Math.min(EST_HEIGHT, maxHeight);

      const rawTop = placeDown ? rect.bottom + GAP : rect.top - GAP - usedHeight;
      const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

      return { postId, left, top, maxHeight };
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

    const nowIso = new Date().toISOString();
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              archivedAt: archived ? nowIso : null,
              updatedAt: nowIso,
            }
          : p,
      ),
    );
    toast.success(archived ? "Post archived." : "Post restored.");
  }

  async function deletePost(postId: string) {
    setError(null);
    const res = await fetch(`/api/portal/blogs/posts/${postId}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to delete post");
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast.success("Post deleted.");
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
    lastSavedSiteSigRef.current = JSON.stringify({
      name: String(json.site.name || "").trim() ? String(json.site.name) : "My Blog",
      slug: String(json.site.slug ?? "").trim(),
      primaryDomain: String(json.site.primaryDomain ?? "").trim(),
    });
    toast.success("Blog workspace created.");
    void refreshAutomationStatus();
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
    lastSavedSiteSigRef.current = JSON.stringify({
      name: String(json.site.name || "").trim() ? String(json.site.name) : "My Blog",
      slug: String(json.site.slug ?? "").trim(),
      primaryDomain: String(json.site.primaryDomain ?? "").trim(),
    });
    toast.success("Blog settings saved.");
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

    window.location.href = `${appBase}/services/blogs/${json.post.id}`;
  }

  async function saveAutomation() {
    setAutoSaving(true);
    setError(null);

    const topics = sanitizeTopics(autoTopics);
    const nextFrequencyDays = Math.min(30, Math.max(1, Math.floor(Number(autoFrequencyDays) || 7)));
    const nextSig = JSON.stringify({
      enabled: Boolean(autoEnabled),
      frequencyDays: nextFrequencyDays,
      topics,
      autoPublish: Boolean(autoPublish),
    });
    const res = await fetch("/api/portal/blogs/automation/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: Boolean(autoEnabled),
        frequencyDays: nextFrequencyDays,
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

    const nextTopics = topics;

    setAutomation((prev) =>
      prev
        ? {
            ...prev,
            enabled: Boolean(autoEnabled),
            frequencyDays: nextFrequencyDays,
            topics: nextTopics,
            autoPublish: Boolean(autoPublish),
          }
        : {
            enabled: Boolean(autoEnabled),
            frequencyDays: nextFrequencyDays,
            topics: nextTopics,
            autoPublish: Boolean(autoPublish),
            lastGeneratedAt: null,
            nextDueAt: null,
            lastRunAt: null,
          },
    );

    lastSavedAutoSigRef.current = nextSig;
    toast.success("Automation saved.");
    await refreshAutomationStatus();
  }

  if (loading && !hasLoadedOnceRef.current) {
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
                      href={withFromOnboarding(`${appBase}/billing?buy=blog&autostart=1`)}
              className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Unlock in Billing
            </Link>
            <Link
                      href={withFromOnboarding(`${appBase}/services`)}
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
            Stay searchable without writing every week. Generate SEO-friendly drafts, edit them, and publish to your hosted blog (or your custom domain).
          </p>
          {refreshing ? (
            <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <InlineSpinner className="h-3.5 w-3.5 animate-spin" label="Refreshing" />
              <span>Refreshing…</span>
            </div>
          ) : null}
        </div>
        {!isPaMobileApp ? (
          <button
            type="button"
            onClick={newDraft}
            aria-label="New blog"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            <span className="text-lg leading-none">+</span>
            <span>New blog</span>
          </button>
        ) : null}
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
              <div className="rounded-2xl border border-zinc-200 bg-linear-to-br from-zinc-50 to-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-zinc-600">Total credits</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">{credits === null ? "N/A" : credits.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-linear-to-br from-zinc-50 to-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-zinc-600">Blog credits used</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">
                  {blogCreditsUsed30d === null ? "N/A" : blogCreditsUsed30d.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Last 30 days · {blogGenerations30d === null ? "N/A" : blogGenerations30d} generation{blogGenerations30d === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className={isPaMobileApp ? "mt-5 overflow-x-auto rounded-2xl border border-zinc-200" : "mt-5 overflow-hidden rounded-2xl border border-zinc-200"}>
              <table className={isPaMobileApp ? "min-w-180 w-full text-left text-sm" : "w-full text-left text-sm"}>
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
                      const excerptPreview = previewText(p.excerpt);

                      return (
                        <tr key={p.id} className="border-t border-zinc-200">
                          <td className="px-4 py-3">
                            <Link href={`${appBase}/services/blogs/${p.id}`} className="font-semibold text-brand-ink hover:underline">
                              {p.title || "Untitled"}
                            </Link>
                            <div className="mt-1 truncate text-xs text-zinc-500">/{p.slug}</div>
                            <div className="mt-2 hidden md:block">
                              {excerptPreview ? (
                                <div className="line-clamp-3 text-xs text-zinc-600">{excerptPreview}</div>
                              ) : (
                                <div className="text-xs text-zinc-400">No excerpt yet</div>
                              )}
                            </div>
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
              Publish right here to your hosted blog (or custom domain), or export drafts to another site (WordPress, Webflow, Shopify, etc.).
            </div>
          </div>
        </>
      ) : null}

      {routeTab === "automation" ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Blog automation schedule</div>
          <div className="mt-2 text-sm text-zinc-600">
            Set a cadence and a topic list. We’ll generate SEO-ready drafts automatically so your website stays fresh and searchable.
          </div>

          <div className="mt-5 space-y-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-zinc-800">Enable automation</span>
              <div className="flex items-center gap-2">
                <ToggleSwitch
                  checked={autoEnabled}
                  disabled={autoSaving}
                  ariaLabel="Enable blog automation"
                  onChange={setAutoEnabled}
                />
                <span className={autoEnabled ? "text-sm font-semibold text-emerald-700" : "text-sm text-zinc-500"}>
                  {autoEnabled ? "On" : "Off"}
                </span>
              </div>
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
                <div className="inline-flex w-full rounded-2xl border border-zinc-200 bg-white p-1 sm:w-auto" role="group" aria-label="Frequency unit">
                  {([
                    { key: "days" as const, label: "Days" },
                    { key: "weeks" as const, label: "Weeks" },
                    { key: "months" as const, label: "Months" },
                  ] satisfies Array<{ key: FrequencyUnit; label: string }>).map((u) => {
                    const active = autoFrequencyUnit === u.key;
                    return (
                      <button
                        key={u.key}
                        type="button"
                        onClick={() => {
                          setAutoFrequencyUnit(u.key);
                          setAutoFrequencyCount((prev) => clampFrequencyCount(prev, u.key));
                        }}
                        className={
                          "flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition sm:flex-none " +
                          (active
                            ? "bg-(--color-brand-blue) text-white shadow-sm"
                            : "text-zinc-700 hover:bg-zinc-50")
                        }
                        aria-pressed={active}
                      >
                        {u.label}
                      </button>
                    );
                  })}
                </div>
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
              <div className="flex items-center gap-2">
                <ToggleSwitch
                  checked={autoPublish}
                  disabled={autoSaving}
                  ariaLabel="Auto-publish blog posts"
                  onChange={setAutoPublish}
                />
                <span className={autoPublish ? "text-sm font-semibold text-emerald-700" : "text-sm text-zinc-500"}>
                  {autoPublish ? "On" : "Off"}
                </span>
              </div>
            </label>
            <div className="text-xs text-zinc-500">
              Auto-publish marks posts as “Published” in this portal (and backdates when catching up). If you publish elsewhere, keep this off and export.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveAutomation}
                disabled={autoSaving || !autoDirty}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {autoSaving ? "Saving…" : autoDirty ? "Save automation" : "Saved"}
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

                  window.location.href = `${appBase}/services/blogs/${json.postId}`;
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {generatingNow ? "Generating…" : "Generate next post now"}
              </button>
            </div>

            {automation ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
                <div>Last generated: {automation.lastGeneratedAt ? formatDate(automation.lastGeneratedAt) : "N/A"}</div>
                <div>Next due: {automation.nextDueAt ? formatDate(automation.nextDueAt) : "N/A"}</div>
                <div>Scheduler last ran: {automation.lastRunAt ? formatDate(automation.lastRunAt) : "N/A"}</div>
                <div className="mt-1 flex flex-col gap-2 text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                  <div>Scheduler checks about hourly. If Next due is in the past, a new post should appear within ~1 hour.</div>
                  <button
                    type="button"
                    onClick={refreshAutomationStatus}
                    disabled={automationStatusBusy}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {automationStatusBusy ? "Refreshing…" : "Refresh status"}
                  </button>
                </div>
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
              <div className="mt-1 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                    <div className="truncate">
                      <span className="font-semibold text-zinc-600">Preview:</span> {publicBlogUrlPreview ?? "Create your blog workspace to get a link."}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    disabled={!publicBlogUrlPreview}
                    onClick={async () => {
                      if (!publicBlogUrlPreview) return;
                      await navigator.clipboard.writeText(publicBlogUrlPreview);
                    }}
                  >
                    Copy preview
                  </button>
                  <a
                    href={publicBlogUrlPreview ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={
                      "inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95 " +
                      (!publicBlogUrlPreview ? "pointer-events-none opacity-60" : "")
                    }
                  >
                    Preview
                  </a>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                    <div className="truncate">
                      <span className="font-semibold text-zinc-600">Live:</span> {liveBlogUrlPreview ?? "…"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    disabled={!liveBlogUrlPreview}
                    onClick={async () => {
                      if (!liveBlogUrlPreview) return;
                      await navigator.clipboard.writeText(liveBlogUrlPreview);
                    }}
                  >
                    Copy live
                  </button>
                  <a
                    href={liveBlogUrlPreview ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={
                      "inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-3 text-sm font-semibold text-white hover:opacity-95 " +
                      (!liveBlogUrlPreview ? "pointer-events-none opacity-60" : "")
                    }
                  >
                    Live
                  </a>
                </div>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                This is your public blog hosted on Purely Automation. If you also want to publish elsewhere, use “Export Markdown”.
              </div>
            </div>

            <div className="mt-6">
              <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Custom domain (optional)</div>

              <div className="mt-8 border-t border-zinc-200 pt-6">
                <div className="text-sm font-semibold text-zinc-900">Typography</div>
                <div className="mt-2 text-sm text-zinc-600">Choose fonts for your hosted blog titles and body.</div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-800">Use brand font</div>
                    <div className="mt-0.5 text-xs text-zinc-500">Uses your Business font from Profile → Business info.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ToggleSwitch
                      checked={Boolean(appearance?.useBrandFont ?? true)}
                      disabled={appearanceSaving}
                      ariaLabel="Use brand font"
                      onChange={(useBrandFont) => {
                        setAppearance((prev) => ({
                          version: 1,
                          useBrandFont,
                          titleFontKey: prev?.titleFontKey ?? "brand",
                          bodyFontKey: prev?.bodyFontKey ?? "brand",
                        }));
                        void saveAppearance({ useBrandFont });
                      }}
                    />
                    <span
                      className={
                        Boolean(appearance?.useBrandFont ?? true)
                          ? "text-sm font-semibold text-emerald-700"
                          : "text-sm text-zinc-500"
                      }
                    >
                      {Boolean(appearance?.useBrandFont ?? true) ? "On" : "Off"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Title font</label>
                    <div className="mt-1">
                      <PortalListboxDropdown<string>
                        value={appearance?.titleFontKey ?? "brand"}
                        options={fontOptions}
                        disabled={appearanceSaving || Boolean(appearance?.useBrandFont ?? true)}
                        onChange={(v) => {
                          const titleFontKey = String(v || "brand");
                          setAppearance((prev) => ({
                            version: 1,
                            useBrandFont: Boolean(prev?.useBrandFont ?? true),
                            titleFontKey,
                            bodyFontKey: prev?.bodyFontKey ?? "brand",
                          }));
                          void saveAppearance({ titleFontKey });
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Body font</label>
                    <div className="mt-1">
                      <PortalListboxDropdown<string>
                        value={appearance?.bodyFontKey ?? "brand"}
                        options={fontOptions}
                        disabled={appearanceSaving || Boolean(appearance?.useBrandFont ?? true)}
                        onChange={(v) => {
                          const bodyFontKey = String(v || "brand");
                          setAppearance((prev) => ({
                            version: 1,
                            useBrandFont: Boolean(prev?.useBrandFont ?? true),
                            titleFontKey: prev?.titleFontKey ?? "brand",
                            bodyFontKey,
                          }));
                          void saveAppearance({ bodyFontKey });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
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
                      href={`${appBase}/services/funnel-builder/settings`}
                      className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
                    >
                      Add / manage domains
                    </Link>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600">Custom domain (Live)</label>
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
                      Live
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
                  disabled={siteSaving || !siteDirty}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {siteSaving ? "Saving…" : siteDirty ? "Save settings" : "Saved"}
                </button>
              )}
            </div>
          </PortalSettingsSection>
        </div>
      ) : null}

      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
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
            <div className="fixed inset-0 z-30" aria-hidden>
              <div className="absolute inset-0" onMouseDown={() => setOpenPostMenu(null)} onTouchStart={() => setOpenPostMenu(null)} />
              <div
                className="fixed z-40 w-56 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
                style={{ left: openPostMenu.left, top: openPostMenu.top, maxHeight: openPostMenu.maxHeight }}
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
                          window.location.href = `${appBase}/services/blogs/${p.id}`;
                        }}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <span className="inline-flex items-center" aria-hidden="true">
                          <IconEdit size={16} />
                        </span>
                        <span className="sr-only">Edit</span>
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
            <div className="fixed inset-0 z-30" aria-hidden>
              <div className="absolute inset-0" onMouseDown={() => setOpenPreviewMenu(null)} onTouchStart={() => setOpenPreviewMenu(null)} />
              <div
                className="fixed z-40 w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
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

      {isPaMobileApp && routeTab === "posts" ? (
        <button
          type="button"
          className="fixed right-4 z-11001 rounded-full bg-[#007aff] px-5 py-3 text-sm font-semibold text-white shadow-xl hover:bg-[#006ae6]"
          style={{
            bottom:
              "calc(var(--pa-portal-embed-footer-offset,0px) + 5.75rem + var(--pa-portal-floating-tools-reserve, 0px))",
          }}
          onClick={() => {
            void newDraft();
          }}
        >
          + New blog
        </button>
      ) : null}
    </div>
  );
}
