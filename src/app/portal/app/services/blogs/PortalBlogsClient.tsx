"use client";

import { upload as uploadToVercelBlob } from "@vercel/blob/client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  IconSidebarSettings,
  PortalSidebarNavButton,
  portalSidebarButtonActiveClass,
  portalSidebarButtonBaseClass,
  portalSidebarButtonInactiveClass,
  portalSidebarIconToneBlueClass,
  portalSidebarIconToneNeutralClass,
  portalSidebarIconTonePinkClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { PortalPageLoadingShell } from "@/components/PortalPageLoadingShell";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { useToast } from "@/components/ToastProvider";
import { PortalBackToOnboardingLink } from "@/components/PortalBackToOnboardingLink";
import { InlineSpinner } from "@/components/InlineSpinner";
import { portalGlassBackdropClass, portalGlassButtonClass, portalGlassPanelClass, portalGlassSectionClass } from "@/components/portalGlass";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import { usePortalUiPreview } from "@/lib/portalUiPreview.client";
import {
  archivePreviewBlogPost,
  createPreviewAutomationDraft,
  createPreviewBlogPost,
  createPreviewBlogSite,
  deletePreviewBlogPost,
  readPreviewBlogState,
  savePreviewAutomationSettings,
  savePreviewBlogAppearance,
  savePreviewBlogSite,
  updatePreviewBlogState,
} from "@/lib/portalBlogsPreview.client";
import { IconEdit, IconEyeGlyph, IconGlobeGlyph, IconServiceGlyph } from "@/app/portal/PortalIcons";
import { PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

const classNames = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

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

type AutomationContextFile = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tag: string;
  shareUrl: string;
  previewUrl?: string;
  createdAt?: string;
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
  contextFiles: AutomationContextFile[];
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

const PREVIEW_ME: Me = {
  user: { email: "preview@purelyautomation.dev", name: "Local Preview", role: "CLIENT" },
  entitlements: { blog: true, booking: true, crm: true },
  billing: { configured: true },
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

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let idx = 0;
  let value = n;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function normalizeDomain(raw: string | null | undefined) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "";
  const withoutProtocol = v.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  return withoutPath.replace(/:\d+$/, "").trim();
}

function describeAutomationHealth(automation: AutomationSettings | null, site: Site | null) {
  if (!automation?.enabled) {
    return {
      label: "Automation off",
      tone: "bg-zinc-100 text-zinc-700",
      message: "Turn automation on when you want the scheduler checking for the next post.",
    };
  }

  if (!site?.id) {
    return {
      label: "Finish setup",
      tone: "bg-amber-50 text-amber-800",
      message: "Create the blog workspace first so scheduled generations have a destination.",
    };
  }

  const now = Date.now();
  const lastRunTs = automation.lastRunAt ? new Date(automation.lastRunAt).getTime() : NaN;
  const nextDueTs = automation.nextDueAt ? new Date(automation.nextDueAt).getTime() : NaN;
  const lastGeneratedTs = automation.lastGeneratedAt ? new Date(automation.lastGeneratedAt).getTime() : NaN;
  const hasRecentHeartbeat = Number.isFinite(lastRunTs) && now - lastRunTs <= 90 * 60 * 1000;
  const dueSoon = Number.isFinite(nextDueTs) && nextDueTs <= now + 60 * 60 * 1000;
  const overdue = Number.isFinite(nextDueTs) && nextDueTs < now - 90 * 60 * 1000;
  const caughtUp = !Number.isFinite(nextDueTs) || (Number.isFinite(lastGeneratedTs) && lastGeneratedTs >= nextDueTs - 1000);

  if (overdue && !hasRecentHeartbeat) {
    return {
      label: "Needs attention",
      tone: "bg-rose-50 text-rose-700",
      message: "The next post is overdue and the scheduler heartbeat looks stale. Refresh status or verify cron health.",
    };
  }

  if (dueSoon) {
    return {
      label: hasRecentHeartbeat ? "In queue" : "Due soon",
      tone: "bg-amber-50 text-amber-800",
      message: hasRecentHeartbeat
        ? "The next post is due and the scheduler has checked in recently. A new post should land shortly."
        : "The next post is nearly due. Save any changes, then keep an eye on the next scheduler heartbeat.",
    };
  }

  return {
    label: caughtUp && hasRecentHeartbeat ? "Healthy" : "Watching",
    tone: caughtUp && hasRecentHeartbeat ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700",
    message: caughtUp && hasRecentHeartbeat
      ? "Automation is on, the scheduler is checking in, and the next post is scheduled normally."
      : "Automation is on. Refresh status if you want a newer scheduler heartbeat.",
  };
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
  const uiPreview = usePortalUiPreview();
  const pathname = usePathname();
  const router = useRouter();
  const appBase = currentAppBase(pathname);
  const portalVariant: PortalVariant = pathname?.startsWith("/credit") ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);
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
  const [, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const [appearance, setAppearance] = useState<BlogAppearance | null>(null);
  const [appearanceSaving, setAppearanceSaving] = useState(false);

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
  const [autoContextFiles, setAutoContextFiles] = useState<AutomationContextFile[]>([]);
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoContextUploadBusy, setAutoContextUploadBusy] = useState(false);
  const [autoMediaPickerOpen, setAutoMediaPickerOpen] = useState(false);
  const lastSavedAutoSigRef = useRef<string>("");
  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainVerifyBusy, setDomainVerifyBusy] = useState(false);
  const [domainVerificationMessage, setDomainVerificationMessage] = useState<string | null>(null);
  const [domainVerificationTone, setDomainVerificationTone] = useState<"neutral" | "success" | "warning">("neutral");
  const [domainVerificationDetails, setDomainVerificationDetails] = useState<null | {
    recordName: string;
    expected: string;
    found?: string[];
  }>(null);

  const entitled = Boolean(me?.entitlements?.blog);

  const normalizedSavedDomain = useMemo(() => normalizeDomain(site?.primaryDomain), [site?.primaryDomain]);
  const normalizedSelectedDomain = useMemo(() => normalizeDomain(siteDomain), [siteDomain]);
  const hasVerifiedCustomDomain = Boolean(normalizedSavedDomain && site?.verifiedAt);
  const selectedDomainStatus = useMemo(() => {
    if (!normalizedSelectedDomain) return null;
    if (normalizedSelectedDomain !== normalizedSavedDomain) return "UNSAVED" as const;
    return site?.verifiedAt ? ("VERIFIED" as const) : ("PENDING" as const);
  }, [normalizedSavedDomain, normalizedSelectedDomain, site?.verifiedAt]);

  const siteHandle = useMemo(() => site?.slug ?? site?.id ?? null, [site?.id, site?.slug]);
  const hostedBlogPath = siteHandle ? `/${siteHandle}/blogs` : null;

  const previewBlogsHref = useMemo(() => {
    // Preview is always the Purely Automation hosted page.
    return hostedBlogPath ? toPurelyHostedUrl(hostedBlogPath) : null;
  }, [hostedBlogPath]);

  const liveBlogsHref = useMemo(() => {
    // Live prefers the verified custom domain, otherwise falls back to the hosted preview.
    if (site?.primaryDomain && site?.verifiedAt) return `https://${site.primaryDomain}/blogs`;
    return hostedBlogPath ? toPurelyHostedUrl(hostedBlogPath) : null;
  }, [hostedBlogPath, site?.primaryDomain, site?.verifiedAt]);

  const setSidebarOverride = useSetPortalSidebarOverride();
  const blogsSidebar = useMemo(() => {
    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>Blogs</div>
          <div className={portalSidebarSectionStackClass}>
            {([
              { key: "posts", label: "Posts" },
              { key: "automation", label: "SEO Autopilot" },
              { key: "settings", label: "Settings" },
            ] as const).map((item) => (
              <PortalSidebarNavButton
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                aria-current={routeTab === item.key ? "page" : undefined}
                label={item.label}
                icon={item.key === "posts" ? <IconServiceGlyph slug="blogs" /> : item.key === "automation" ? <IconServiceGlyph slug="automations" /> : <IconSidebarSettings />}
                iconToneClassName={item.key === "settings" ? portalSidebarIconToneNeutralClass : item.key === "posts" ? portalSidebarIconToneBlueClass : portalSidebarIconTonePinkClass}
                className={
                  `${portalSidebarButtonBaseClass} ` +
                  (routeTab === item.key ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass)
                }
              >
                {item.label}
              </PortalSidebarNavButton>
            ))}
          </div>
        </div>

        <div>
          <div className={portalSidebarSectionTitleClass}>Links</div>
          <div className={portalSidebarSectionStackClass}>
            <a
              href={previewBlogsHref ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={`block ${portalSidebarButtonBaseClass} ${previewBlogsHref ? portalSidebarButtonInactiveClass : "pointer-events-none bg-zinc-100 text-zinc-400"}`}
            >
              <span className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-90"><IconEyeGlyph size={18} /></span>
                <span>Preview</span>
              </span>
            </a>
            <a
              href={liveBlogsHref ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={`block ${portalSidebarButtonBaseClass} ${liveBlogsHref ? portalSidebarButtonInactiveClass : "pointer-events-none bg-zinc-100 text-zinc-400"}`}
            >
              <span className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-90"><IconGlobeGlyph size={18} /></span>
                <span>Live</span>
              </span>
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
    if (site?.primaryDomain && site?.verifiedAt) return `https://${site.primaryDomain}/blogs`;
    return publicBlogUrlPreview;
  }, [publicBlogUrlPreview, site?.primaryDomain, site?.verifiedAt]);

  const blogPageEditorHref = useMemo(() => `${appBase}/services/blogs/page-editor?pageKey=blogs_index`, [appBase]);

  const automationHealth = useMemo(() => describeAutomationHealth(automation, site), [automation, site]);

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
      contextFiles: autoContextFiles.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        tag: file.tag,
        shareUrl: file.shareUrl,
      })),
      autoPublish: Boolean(autoPublish),
    });
  }, [autoContextFiles, autoEnabled, autoFrequencyDays, autoPublish, autoTopicsSanitized]);
  const autoDirty = autoSig !== lastSavedAutoSigRef.current;

  const creditsPerWeekEstimate = useMemo(() => {
    const freq = Math.max(1, Math.floor(Number(autoFrequencyDays) || 7));
    const postsPerWeek = Math.ceil(7 / freq);
    return Math.max(0, postsPerWeek - 1);
  }, [autoFrequencyDays]);

  const [automationStatusBusy, setAutomationStatusBusy] = useState(false);

  const applyPreviewSnapshot = useCallback((snapshot: ReturnType<typeof readPreviewBlogState>) => {
    setMe(PREVIEW_ME);
    setSite(snapshot.site);
    setPosts(snapshot.posts);
    setAutomation(snapshot.automation);
    setAppearance(snapshot.appearance);
    setCredits(snapshot.credits);
    setBlogCreditsUsed30d(snapshot.blogCreditsUsed30d);
    setBlogGenerations30d(snapshot.blogGenerations30d);

    setSiteName(snapshot.site?.name ?? "");
    setSiteSlug(snapshot.site?.slug ?? "");
    setSiteDomain(snapshot.site?.primaryDomain ?? "");
    lastSavedSiteSigRef.current = JSON.stringify({
      name: (snapshot.site?.name ?? "").trim() ? String(snapshot.site?.name ?? "") : "My Blog",
      slug: String(snapshot.site?.slug ?? "").trim(),
      primaryDomain: String(snapshot.site?.primaryDomain ?? "").trim(),
    });

    const nextTopics = sanitizeTopics(snapshot.automation.topics ?? []);
    const preset = inferFrequencyPreset(snapshot.automation.frequencyDays);
    setAutoEnabled(Boolean(snapshot.automation.enabled));
    setAutoFrequencyUnit(preset.unit);
    setAutoFrequencyCount(preset.count);
    setAutoTopics(nextTopics);
    setAutoContextFiles(Array.isArray(snapshot.automation.contextFiles) ? snapshot.automation.contextFiles : []);
    setAutoPublish(Boolean(snapshot.automation.autoPublish));
    lastSavedAutoSigRef.current = JSON.stringify({
      enabled: Boolean(snapshot.automation.enabled),
      frequencyDays: Math.min(30, Math.max(1, Math.floor(Number(snapshot.automation.frequencyDays) || 7))),
      topics: nextTopics,
      contextFiles: Array.isArray(snapshot.automation.contextFiles)
        ? snapshot.automation.contextFiles.map((file) => ({
            id: file.id,
            fileName: file.fileName,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            tag: file.tag,
            shareUrl: file.shareUrl,
          }))
        : [],
      autoPublish: Boolean(snapshot.automation.autoPublish),
    });
  }, []);

  const refreshAutomationStatus = useCallback(async () => {
    if (uiPreview) {
      setAutomationStatusBusy(true);
      try {
        applyPreviewSnapshot(readPreviewBlogState());
      } finally {
        setAutomationStatusBusy(false);
      }
      return;
    }

    // Refresh only the status fields so we don’t clobber in-progress edits
    // or throw the whole Blogs UI into a loading screen.
    setAutomationStatusBusy(true);
    try {
      const res = await fetch("/api/portal/blogs/automation/settings", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
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
  }, [applyPreviewSnapshot, uiPreview, variantHeaders]);

  const refreshAll = useCallback(async () => {
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);

    if (uiPreview) {
      try {
        applyPreviewSnapshot(readPreviewBlogState());
      } finally {
        if (!hasLoadedOnceRef.current) hasLoadedOnceRef.current = true;
        if (firstLoad) setLoading(false);
        else setRefreshing(false);
      }
      return;
    }

    try {
      const [meRes, siteRes, postsRes, autoRes, creditsRes, usageRes, appearanceRes] = await Promise.all([
        fetch("/api/customer/me", {
          cache: "no-store",
          headers: {
            "x-pa-app": "portal",
            ...variantHeaders,
          },
        }),
        fetch("/api/portal/blogs/site", { cache: "no-store", headers: variantHeaders }),
        fetch("/api/portal/blogs/posts?take=100", { cache: "no-store", headers: variantHeaders }),
        fetch("/api/portal/blogs/automation/settings", { cache: "no-store", headers: variantHeaders }),
        fetch("/api/portal/credits", { cache: "no-store", headers: variantHeaders }),
        fetch("/api/portal/blogs/usage?range=30d", { cache: "no-store", headers: variantHeaders }),
        fetch("/api/portal/blogs/appearance", { cache: "no-store", headers: variantHeaders }),
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
      const appearanceJson = (await appearanceRes.json().catch(() => ({}))) as {
        ok?: boolean;
        appearance?: BlogAppearance;
        error?: string;
      };

      if (!meRes.ok) {
        setError((meJson as { error?: string })?.error ?? "This blog workspace is still syncing. Retry here, open blog setup, or ask Pura.");
        return;
      }

      setMe(meJson as Me);

      if (!siteRes.ok) {
        setError(siteJson.error ?? "Blog setup is still syncing. Retry here, open blog setup, or ask Pura.");
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
        setAutoContextFiles(Array.isArray(autoJson.settings.contextFiles) ? autoJson.settings.contextFiles : []);
        setAutoPublish(Boolean(autoJson.settings.autoPublish));
        lastSavedAutoSigRef.current = JSON.stringify({
          enabled: Boolean(autoJson.settings.enabled),
          frequencyDays: Math.min(30, Math.max(1, Math.floor(Number(autoJson.settings.frequencyDays) || 7))),
          topics: nextTopics,
          contextFiles: Array.isArray(autoJson.settings.contextFiles)
            ? autoJson.settings.contextFiles.map((file) => ({
                id: file.id,
                fileName: file.fileName,
                mimeType: file.mimeType,
                fileSize: file.fileSize,
                tag: file.tag,
                shareUrl: file.shareUrl,
              }))
            : [],
          autoPublish: Boolean(autoJson.settings.autoPublish),
        });
      }
    } finally {
      if (!hasLoadedOnceRef.current) hasLoadedOnceRef.current = true;
      if (firstLoad) setLoading(false);
      else setRefreshing(false);
    }
  }, [applyPreviewSnapshot, uiPreview, variantHeaders]);

  const saveAppearance = useCallback(
    async (next: Partial<BlogAppearance>) => {
      if (appearanceSaving) return;
      setAppearanceSaving(true);
      try {
        if (uiPreview) {
          const saved = savePreviewBlogAppearance(next);
          setAppearance(saved);
          return;
        }

        const res = await fetch("/api/portal/blogs/appearance", {
          method: "PUT",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify(next),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; appearance?: BlogAppearance; error?: string };
        if (!res.ok || !json.ok || !json.appearance) {
          toast.error(json.error ?? "Blog fonts did not save. Retry here in appearance settings.");
          return;
        }
        setAppearance(json.appearance);
      } finally {
        setAppearanceSaving(false);
      }
    },
    [appearanceSaving, toast, uiPreview, variantHeaders],
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

    if (uiPreview) {
      archivePreviewBlogPost(postId, archived);
      applyPreviewSnapshot(readPreviewBlogState());
      toast.success(archived ? "Post archived." : "Post restored.");
      return;
    }

    const res = await fetch(`/api/portal/blogs/posts/${postId}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ archived }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "That post did not update. Retry here, open blog setup, or ask Pura.");
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

    if (uiPreview) {
      deletePreviewBlogPost(postId);
      applyPreviewSnapshot(readPreviewBlogState());
      toast.success("Post deleted.");
      return;
    }

    const res = await fetch(`/api/portal/blogs/posts/${postId}`, { method: "DELETE", headers: variantHeaders });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "That post did not delete. Retry here, open blog setup, or ask Pura.");
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast.success("Post deleted.");
  }

  async function createSite() {
    setSiteSaving(true);
    setError(null);

    if (uiPreview) {
      createPreviewBlogSite({ name: siteName || "My Blog", slug: siteSlug, primaryDomain: siteDomain || null });
      applyPreviewSnapshot(readPreviewBlogState());
      setSiteSaving(false);
      toast.success("Blog workspace created.");
      return;
    }

    const res = await fetch("/api/portal/blogs/site", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ name: siteName || "My Blog", slug: siteSlug, primaryDomain: siteDomain }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; site?: Site; error?: string };
    setSiteSaving(false);

    if (!res.ok || !json.ok || !json.site) {
      setError(json.error ?? "Blog workspace did not create. Retry here, open blog setup, or ask Pura.");
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

  async function saveSite(overrides?: { primaryDomain?: string | null }) {
    const nextName = siteName.trim() ? siteName : "My Blog";
    const nextPrimaryDomain = normalizeDomain(overrides?.primaryDomain ?? siteDomain);

    setSiteSaving(true);
    setError(null);

    if (uiPreview) {
      savePreviewBlogSite({ name: nextName, slug: siteSlug, primaryDomain: nextPrimaryDomain || null });
      applyPreviewSnapshot(readPreviewBlogState());
      setSiteSaving(false);
      toast.success("Blog settings saved.");
      return;
    }

    const res = await fetch("/api/portal/blogs/site", {
      method: "PUT",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({
        name: nextName,
        slug: siteSlug,
        primaryDomain: nextPrimaryDomain,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; site?: Site; error?: string };
    setSiteSaving(false);

    if (!res.ok || !json.ok || !json.site) {
      setError(json.error ?? "Blog settings did not save. Retry here, open blog setup, or ask Pura to help.");
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
      setError("Finish blog setup first, then create the first draft.");
      onTabChange("settings");
      return;
    }

    setError(null);

    if (uiPreview) {
      const post = createPreviewBlogPost({ title: "" });
      router.push(`${appBase}/services/blogs/${post.id}`, { scroll: false });
      return;
    }

    const res = await fetch("/api/portal/blogs/posts", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ title: "" }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; post?: { id: string }; error?: string };
    if (!res.ok || !json.ok || !json.post?.id) {
      setError(json.error ?? "That draft did not create. Retry here, open blog setup, or ask Pura.");
      return;
    }

    router.push(`${appBase}/services/blogs/${json.post.id}`, { scroll: false });
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
      contextFiles: autoContextFiles.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        tag: file.tag,
        shareUrl: file.shareUrl,
      })),
      autoPublish: Boolean(autoPublish),
    });

    if (uiPreview) {
      savePreviewAutomationSettings({
        enabled: Boolean(autoEnabled),
        frequencyDays: nextFrequencyDays,
        topics,
        contextFiles: autoContextFiles,
        autoPublish: Boolean(autoPublish),
      });
      applyPreviewSnapshot(readPreviewBlogState());
      setAutoSaving(false);
      lastSavedAutoSigRef.current = nextSig;
      toast.success("Automation saved.");
      return;
    }

    const res = await fetch("/api/portal/blogs/automation/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({
        enabled: Boolean(autoEnabled),
        frequencyDays: nextFrequencyDays,
        topics,
        contextFiles: autoContextFiles,
        autoPublish: Boolean(autoPublish),
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; settings?: Partial<AutomationSettings> };
    setAutoSaving(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Automation settings did not save. Retry here, open blog setup, or ask Pura to help.");
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
            contextFiles: autoContextFiles,
            autoPublish: Boolean(autoPublish),
          }
        : {
            enabled: Boolean(autoEnabled),
            frequencyDays: nextFrequencyDays,
            topics: nextTopics,
            contextFiles: autoContextFiles,
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

  function addAutomationContextFile(item: AutomationContextFile | PortalMediaPickItem) {
    setAutoContextFiles((prev) => {
      const normalized: AutomationContextFile = {
        id: String(item.id || "").trim(),
        fileName: String(item.fileName || "Reference file").trim() || "Reference file",
        mimeType: String(item.mimeType || "application/octet-stream").trim() || "application/octet-stream",
        fileSize: Number.isFinite(item.fileSize) ? Number(item.fileSize) : 0,
        tag: String((item as any).tag || "").trim(),
        shareUrl: String((item as any).shareUrl || "").trim(),
        ...(String((item as any).previewUrl || "").trim() ? { previewUrl: String((item as any).previewUrl || "").trim() } : {}),
        ...(String((item as any).createdAt || "").trim() ? { createdAt: String((item as any).createdAt || "").trim() } : {}),
      };
      if (!normalized.id || !normalized.fileName || !normalized.shareUrl) return prev;
      const withoutExisting = prev.filter((file) => file.id !== normalized.id);
      return [...withoutExisting, normalized].slice(-12);
    });
  }

  async function uploadAutomationContextFiles(files: FileList | null) {
    if (!files?.length || autoContextUploadBusy) return;

    if (uiPreview) {
      const previewFiles = Array.from(files).slice(0, Math.max(0, 12 - autoContextFiles.length));
      if (!previewFiles.length) return;
      const nextFiles = previewFiles.map((file, index) => ({
        id: `preview-context-upload-${Date.now()}-${index}`,
        fileName: file.name || "Reference file",
        mimeType: file.type || "application/octet-stream",
        fileSize: Number.isFinite(file.size) ? file.size : 0,
        tag: "preview",
        shareUrl: `preview://${encodeURIComponent(file.name || `file-${index + 1}`)}`,
      }));
      setAutoContextFiles((prev) => [...prev, ...nextFiles].slice(-12));
      toast.success(nextFiles.length === 1 ? "Context file added." : "Context files added.");
      return;
    }

    setAutoContextUploadBusy(true);
    try {
      const list = Array.from(files).slice(0, Math.max(0, 12 - autoContextFiles.length));
      for (const file of list) {
        const blob = await uploadToVercelBlob(file.name || "upload.bin", file, {
          access: "public",
          handleUploadUrl: "/api/portal/media/blob-upload",
          headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
        });

        const finalizeRes = await fetch("/api/portal/media/items/from-blob", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...variantHeaders,
          },
          body: JSON.stringify({
            url: blob.url,
            fileName: file.name || blob.pathname || "upload.bin",
            mimeType: file.type || blob.contentType || "application/octet-stream",
            fileSize: Number.isFinite(file.size) ? file.size : 0,
            folderId: null,
          }),
        });
        const finalizeJson = (await finalizeRes.json().catch(() => null)) as any;
        if (!finalizeRes.ok || !finalizeJson || finalizeJson.ok !== true || !finalizeJson.item) {
          throw new Error(typeof finalizeJson?.error === "string" ? finalizeJson.error : "Those context files did not add. Try again here or keep choosing files from this panel.");
        }

        addAutomationContextFile(finalizeJson.item as PortalMediaPickItem);
      }

      toast.success(list.length === 1 ? "Context file added." : "Context files added.");
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Those context files did not add. Try again here or keep choosing files from this panel.");
    } finally {
      setAutoContextUploadBusy(false);
    }
  }

  async function verifyCustomDomain(domainRaw?: string) {
    const domain = normalizeDomain(domainRaw ?? siteDomain);
    if (!domain) {
      setDomainVerificationTone("warning");
      setDomainVerificationMessage("Enter a domain first.");
      setDomainVerificationDetails(null);
      return;
    }

    if (uiPreview) {
      updatePreviewBlogState((state) => ({
        ...state,
        site: state.site
          ? {
              ...state.site,
              primaryDomain: domain,
              verifiedAt: new Date().toISOString(),
            }
          : state.site,
      }));
      applyPreviewSnapshot(readPreviewBlogState());
      setDomainVerificationTone("success");
      setDomainVerificationMessage("Preview domain verified.");
      setDomainVerificationDetails({
        recordName: `_purelyautomation.${domain}`,
        expected: `verify=${site?.verificationToken || "preview-token"}`,
      });
      return;
    }

    setDomainVerifyBusy(true);
    setDomainVerificationMessage(null);
    try {
      const res = await fetch("/api/portal/blogs/site/verify", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ domain }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      setDomainVerificationDetails(
        json?.recordName && json?.expected
          ? {
              recordName: String(json.recordName),
              expected: String(json.expected),
              found: Array.isArray(json.found) ? json.found.map((value: unknown) => String(value)).slice(0, 8) : undefined,
            }
          : null,
      );

      if (!res.ok || json?.ok !== true || json?.verified !== true) {
        setDomainVerificationTone("warning");
        setDomainVerificationMessage(String(json?.error || "Verification did not pass yet."));
        return;
      }

      setSite((prev) => (prev ? { ...prev, primaryDomain: domain, verifiedAt: json?.site?.verifiedAt || new Date().toISOString() } : prev));
      setSiteDomain(domain);
      setDomainDraft(domain);
      setDomainVerificationTone("success");
      setDomainVerificationMessage("Domain verified and ready for the live blog.");
      toast.success("Custom domain verified.");
    } finally {
      setDomainVerifyBusy(false);
    }
  }

  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <PortalBackToOnboardingLink />
        <PortalPageLoadingShell sections={2} minHeightClassName="min-h-[28rem]" className="px-0 sm:px-0" />
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
              Enable Automated Blogs
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
      <div className="flex justify-between gap-3" />

      {error ? (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Blogs needs attention</div>
          <div className="mt-1 text-red-800">{error}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void refreshAll();
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => onTabChange("settings")}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Open blog setup
            </button>
            <Link
              href={`${appBase}/ai-chat?onboarding=1`}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Ask Pura
            </Link>
          </div>
        </div>
      ) : null}

      {routeTab === "posts" ? (
        <>
          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Posts</div>
                <div className="mt-2 text-sm text-zinc-600">Start with setup, then move into drafting and publishing without guessing what comes next.</div>
              </div>
            </div>

            {!site ? (
              <div className="mt-5 rounded-4xl border border-zinc-200 bg-linear-to-br from-stone-50 via-white to-blue-50/60 p-5 shadow-sm sm:p-6">
                <div className="max-w-3xl">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Start here</div>
                  <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[2rem]">Set up the blog workspace before writing the first post.</div>
                  <div className="mt-3 text-sm leading-6 text-zinc-600 sm:text-[15px]">
                    The workspace needs a name, a hosted path, and optionally a domain before the editor feels grounded. Once that is set, the first draft becomes the obvious next step instead of a dead end.
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="rounded-3xl border border-zinc-200 bg-white/90 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Step 1</div>
                    <div className="mt-2 text-base font-semibold text-zinc-900">Create the workspace</div>
                    <div className="mt-2 text-sm text-zinc-600">Name the blog, set the hosted slug, and create the base link that all posts will live under.</div>
                  </div>
                  <div className="rounded-3xl border border-zinc-200 bg-white/90 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Step 2</div>
                    <div className="mt-2 text-base font-semibold text-zinc-900">Confirm preview and live paths</div>
                    <div className="mt-2 text-sm text-zinc-600">Make sure the hosted preview link looks right. If you want a custom domain, connect it after the workspace exists.</div>
                  </div>
                  <div className="rounded-3xl border border-zinc-200 bg-white/90 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Step 3</div>
                    <div className="mt-2 text-base font-semibold text-zinc-900">Write the first post</div>
                    <div className="mt-2 text-sm text-zinc-600">Once setup is ready, the editor opens with a cleaner publish flow and the preview links make more sense.</div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => onTabChange("settings")}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                  >
                    Open blog setup
                  </button>
                  <Link
                    href={`${appBase}/profile`}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  >
                    Business info
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDomainDraft(siteDomain || "");
                      setDomainVerificationMessage(null);
                      setDomainVerificationDetails(null);
                      setDomainModalOpen(true);
                    }}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  >
                    Domains
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-linear-to-br from-zinc-50 to-white p-4 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-600">Total credits</div>
                    <div className="mt-2 text-2xl font-bold text-brand-ink">{credits === null ? "Syncing balance" : credits.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-linear-to-br from-zinc-50 to-white p-4 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-600">Blog credits used</div>
                    <div className="mt-2 text-2xl font-bold text-brand-ink">
                      {blogCreditsUsed30d === null ? "Watching usage" : blogCreditsUsed30d.toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Last 30 days · {blogGenerations30d === null ? "No drafts generated in this window" : `${blogGenerations30d} generation${blogGenerations30d === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  {!isPaMobileApp ? (
                    <button
                      type="button"
                      onClick={() => {
                        void newDraft();
                      }}
                      aria-label="New blog"
                      className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity duration-100 hover:opacity-90"
                    >
                      + New blog
                    </button>
                  ) : null}
                </div>

                {posts.length === 0 ? (
                  <div className="mt-5 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50/80 p-6 text-center">
                    <div className="text-sm font-semibold text-zinc-900">Your workspace is ready.</div>
                    <div className="mt-2 text-sm text-zinc-600">Create the first post to check the editor, preview hierarchy, and publish controls.</div>
                    <button
                      type="button"
                      onClick={() => {
                        void newDraft();
                      }}
                      className="mt-4 inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                    >
                      Create first post
                    </button>
                  </div>
                ) : null}

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
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="font-semibold text-zinc-900">Your blog is ready for the first post</div>
                                <div className="mt-1 text-sm text-zinc-600">Create the first draft when you’re ready, or open the page editor if you want the blog shell polished first.</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void newDraft();
                                  }}
                                  className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity duration-100 hover:opacity-90"
                                >
                                  Create first post
                                </button>
                                <Link
                                  href={blogPageEditorHref}
                                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                                >
                                  Open page editor
                                </Link>
                              </div>
                            </div>
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
                                <div className="text-xs text-zinc-400">Excerpt not written yet</div>
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
                                className={classNames("inline-flex h-9 w-9 items-center justify-center rounded-2xl text-lg font-semibold text-zinc-700 hover:bg-white/80", portalGlassButtonClass)}
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
                  Publish right here to your hosted blog (or custom domain), or export drafts to another site once the content is ready.
                  {uiPreview ? " Local preview mode is keeping all of this client-side." : ""}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      {routeTab === "automation" ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">SEO content schedule</div>
          <div className="mt-2 text-sm text-zinc-600">
            Set a cadence and an optional topic queue. We use your business details to generate SEO-ready drafts automatically so your website stays fresh and searchable.
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Automation health</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${automationHealth.tone}`}>
                      {automationHealth.label}
                    </span>
                    {automationStatusBusy ? <InlineSpinner label="Refreshing automation status" /> : null}
                  </div>
                  <div className="mt-2 max-w-3xl text-sm text-zinc-600">{automationHealth.message}</div>
                </div>
                <button
                  type="button"
                  onClick={refreshAutomationStatus}
                  disabled={automationStatusBusy}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                >
                  {automationStatusBusy ? "Refreshing…" : "Refresh status"}
                </button>
              </div>
            </div>

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
                    Add a few topics to guide what gets generated, or leave this empty and we’ll lean on your business profile for broader SEO content ideas.
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
              <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
                Topics run in order and loop back around after the list is exhausted, so the schedule can keep publishing without you having to rebuild the queue every time.
              </div>
            </div>

            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Context files</label>
                  <div className="mt-1 text-sm text-zinc-600">Attach files from Media Library so generation stays grounded in your own assets and references.</div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60">
                    {autoContextUploadBusy ? "Uploading…" : uiPreview ? "Preview upload" : "Upload file"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={autoContextUploadBusy}
                      onChange={(e) => {
                        void uploadAutomationContextFiles(e.target.files);
                        if (e.target) e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={uiPreview}
                    onClick={() => setAutoMediaPickerOpen(true)}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {uiPreview ? "Media library disabled in preview" : "Choose from media library"}
                  </button>
                </div>
              </div>

              {autoContextFiles.length ? (
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {autoContextFiles.map((file) => (
                    <div key={file.id} className={`flex items-center justify-between gap-3 rounded-2xl p-3 ${portalGlassSectionClass}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        {file.previewUrl && file.mimeType.startsWith("image/") ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={file.previewUrl} alt={file.fileName} className="h-10 w-10 rounded-2xl object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                            {file.mimeType.startsWith("image/") ? "IMG" : file.mimeType.startsWith("video/") ? "VIDEO" : "FILE"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">{file.fileName}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            {file.tag ? <span className="font-mono">tag: {file.tag}</span> : null}
                            {file.tag ? <span>•</span> : null}
                            <span>{formatBytes(file.fileSize)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoContextFiles((prev) => prev.filter((entry) => entry.id !== file.id))}
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                  Add PDFs, images, or other reference files from your media library. The generator uses those filenames, tags, and links as blog context.
                </div>
              )}
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
                    setError("Finish blog setup first, then generate the first post.");
                    onTabChange("settings");
                    return;
                  }

                  if (uiPreview) {
                    setGeneratingNow(true);
                    setError(null);
                    const previewPost = createPreviewAutomationDraft();
                    setGeneratingNow(false);
                    applyPreviewSnapshot(readPreviewBlogState());
                    if (!previewPost?.id) {
                      setError("That post did not generate. Try again here or keep editing this automation panel.");
                      return;
                    }
                    router.push(`${appBase}/services/blogs/${previewPost.id}`, { scroll: false });
                    return;
                  }

                  setGeneratingNow(true);
                  setError(null);

                  const res = await fetch("/api/portal/blogs/automation/generate-now", { method: "POST", headers: variantHeaders });
                  const json = (await res.json().catch(() => ({}))) as any;

                  if (res.status === 402 && json?.code === "INSUFFICIENT_CREDITS") {
                    setGeneratingNow(false);
                    setError(json?.error ?? "Not enough credits.");
                    return;
                  }

                  if (!res.ok || !json?.ok || !json?.postId) {
                    setGeneratingNow(false);
                    setError(json?.error ?? "That post did not generate. Try again here or keep editing this automation panel.");
                    return;
                  }

                  router.push(`${appBase}/services/blogs/${json.postId}`, { scroll: false });
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-linear-to-r from-fuchsia-500 via-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(14,165,233,0.28)] transition hover:scale-[1.01] hover:opacity-95 disabled:scale-100 disabled:opacity-60"
              >
                {generatingNow ? "Generating…" : "Generate next post now"}
              </button>
            </div>

            {automation ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
                <div>Last generated: {automation.lastGeneratedAt ? formatDate(automation.lastGeneratedAt) : "Not generated yet"}</div>
                <div>Next due: {automation.nextDueAt ? formatDate(automation.nextDueAt) : "Not scheduled yet"}</div>
                <div>Scheduler last ran: {automation.lastRunAt ? formatDate(automation.lastRunAt) : "Scheduler has not checked in yet"}</div>
                <div className="mt-1 text-zinc-500">Scheduler checks about hourly. If Next due is in the past, a new post should appear within about an hour when the heartbeat is healthy.</div>
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
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="My Company Blog"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Blog URL slug</label>
                <input
                  value={siteSlug}
                  onChange={(e) => setSiteSlug(e.target.value)}
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
                    <span className="inline-flex items-center gap-2">
                      <IconEyeGlyph size={16} />
                      <span>Preview</span>
                    </span>
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
                  <Link
                    href={blogPageEditorHref}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <IconEdit size={16} />
                      <span>Edit live page</span>
                    </span>
                  </Link>
                  <a
                    href={liveBlogUrlPreview ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={
                      "inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-3 text-sm font-semibold text-white hover:opacity-95 " +
                      (!liveBlogUrlPreview ? "pointer-events-none opacity-60" : "")
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      <IconGlobeGlyph size={16} />
                      <span>Live</span>
                    </span>
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
                  <div className="mt-1 text-xs text-zinc-500">Add the domain here, copy the TXT record, and verify it without leaving Blogs.</div>
                </div>
                {selectedDomainStatus ? (
                  <span
                    className={
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                      (selectedDomainStatus === "VERIFIED"
                        ? "bg-emerald-50 text-emerald-700"
                        : selectedDomainStatus === "PENDING"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-zinc-100 text-zinc-700")
                    }
                  >
                    {selectedDomainStatus === "VERIFIED"
                      ? "Verified"
                      : selectedDomainStatus === "PENDING"
                        ? "Pending verification"
                        : "Unsaved"}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Domain</label>
                  <div className="mt-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                    <div className="truncate">{normalizedSelectedDomain || "Default domain in use"}</div>
                  </div>

                  <div className="mt-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                    <div className="text-xs text-zinc-500">
                      {!site
                        ? "You can prefill a domain now. Save or create the workspace before verifying DNS."
                        : hasVerifiedCustomDomain
                          ? "This domain is already live for your blog."
                          : "Open domain setup to save the domain, copy DNS values, and verify it here."}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDomainDraft(siteDomain || site?.primaryDomain || "");
                        setDomainVerificationMessage(null);
                        setDomainVerificationDetails(null);
                        setDomainModalOpen(true);
                      }}
                      className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
                    >
                      Add / manage domains
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600">Custom domain (Live)</label>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
                      <div className="truncate">{normalizedSelectedDomain ? `https://${normalizedSelectedDomain}/blogs` : "Select a domain"}</div>
                    </div>
                    <a
                      href={hasVerifiedCustomDomain && site?.primaryDomain ? `https://${site.primaryDomain}/blogs` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={
                        "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 " +
                        (hasVerifiedCustomDomain && site?.primaryDomain ? "" : "pointer-events-none opacity-60")
                      }
                    >
                      Live
                    </a>
                  </div>
                  {site?.primaryDomain && !site?.verifiedAt ? (
                    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      This domain is saved to Blogs and waiting on DNS verification.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

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
                    <PortalFontDropdown
                      value={appearance?.titleFontKey ?? "brand"}
                      extraOptions={[{ value: "brand", label: "Brand" }]}
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
                      className="w-full"
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                      placeholder="Choose a title font"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600">Body font</label>
                  <div className="mt-1">
                    <PortalFontDropdown
                      value={appearance?.bodyFontKey ?? "brand"}
                      extraOptions={[{ value: "brand", label: "Brand" }]}
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
                      className="w-full"
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                      placeholder="Choose a body font"
                    />
                  </div>
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
                  onClick={() => {
                    void saveSite();
                  }}
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
                  className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
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

      <PortalMediaPickerModal
        open={autoMediaPickerOpen}
        onClose={() => setAutoMediaPickerOpen(false)}
        onPick={(item) => {
          addAutomationContextFile(item);
          setAutoMediaPickerOpen(false);
          toast.success("Context file added.");
        }}
        title="Add blog context from media library"
        confirmLabel="Use as context"
        variant={portalVariant}
      />

      {domainModalOpen ? (
        <div className="fixed inset-0 z-80" role="dialog" aria-modal="true">
          <div className={`absolute inset-0 ${portalGlassBackdropClass}`} onMouseDown={() => setDomainModalOpen(false)} onTouchStart={() => setDomainModalOpen(false)} />
          <div className="fixed inset-x-0 top-0 flex justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]">
            <div
              className={`w-full max-w-2xl overflow-hidden rounded-4xl border border-white/45 p-5 ${portalGlassPanelClass}`}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Custom domain setup</div>
                  <div className="mt-1 text-sm text-zinc-600">Save a blog domain, copy the TXT record, and verify DNS right here.</div>
                </div>
                <button
                  type="button"
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 text-zinc-600 hover:text-zinc-900 ${portalGlassButtonClass}`}
                  onClick={() => setDomainModalOpen(false)}
                  aria-label="Close domain setup"
                  title="Close"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className={`rounded-3xl p-4 ${portalGlassSectionClass}`}>
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Domain</label>
                    <input
                      value={domainDraft}
                      onChange={(e) => setDomainDraft(normalizeDomain(e.target.value))}
                      placeholder="blog.yourdomain.com"
                      className="mt-3 w-full rounded-2xl border border-white/45 bg-white/60 px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
                    />
                    <div className="mt-2 text-xs text-zinc-500">Use a full subdomain like `blog.yourdomain.com` or a root domain if that is how you plan to serve the blog.</div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={siteSaving || (!site && !siteName.trim())}
                        onClick={async () => {
                          const nextDomain = normalizeDomain(domainDraft);
                          setDomainVerificationMessage(null);
                          setDomainVerificationDetails(null);
                          setSiteDomain(nextDomain);
                          if (site) {
                            await saveSite({ primaryDomain: nextDomain || null });
                          }
                        }}
                        className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      >
                        {siteSaving ? "Saving…" : site ? "Save domain to Blogs" : "Use this when creating the workspace"}
                      </button>
                      <button
                        type="button"
                        disabled={!domainDraft}
                        onClick={async () => {
                          if (!domainDraft) return;
                          await navigator.clipboard.writeText(domainDraft);
                          toast.success("Domain copied.");
                        }}
                        className="inline-flex items-center justify-center rounded-2xl border border-white/50 bg-white/65 px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80 disabled:opacity-60"
                      >
                        Copy domain
                      </button>
                    </div>
                  </div>

                  <div className={`rounded-3xl p-4 ${portalGlassSectionClass}`}>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">DNS record to add</div>
                    {site?.verificationToken && normalizeDomain(domainDraft || siteDomain || site?.primaryDomain) ? (
                      <>
                        <div className="mt-3 rounded-2xl border border-white/45 bg-white/60 px-4 py-3 text-sm text-zinc-900">
                          <div className="text-xs font-semibold text-zinc-500">TXT name</div>
                          <div className="mt-1 break-all font-mono text-[13px]">{`_purelyautomation.${normalizeDomain(domainDraft || siteDomain || site?.primaryDomain)}`}</div>
                        </div>
                        <div className="mt-3 rounded-2xl border border-white/45 bg-white/60 px-4 py-3 text-sm text-zinc-900">
                          <div className="text-xs font-semibold text-zinc-500">TXT value</div>
                          <div className="mt-1 break-all font-mono text-[13px]">{`verify=${site.verificationToken}`}</div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={async () => {
                              const value = `_purelyautomation.${normalizeDomain(domainDraft || siteDomain || site?.primaryDomain)}`;
                              await navigator.clipboard.writeText(value);
                              toast.success("TXT record name copied.");
                            }}
                            className="inline-flex items-center justify-center rounded-2xl border border-white/50 bg-white/65 px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80"
                          >
                            Copy TXT name
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const value = `verify=${site.verificationToken}`;
                              await navigator.clipboard.writeText(value);
                              toast.success("TXT record value copied.");
                            }}
                            className="inline-flex items-center justify-center rounded-2xl border border-white/50 bg-white/65 px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80"
                          >
                            Copy TXT value
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed border-white/45 bg-white/45 px-4 py-4 text-sm text-zinc-600">
                        Save or create the blog workspace with a domain first, then the TXT record appears here for copy-paste.
                      </div>
                    )}
                  </div>
                </div>

                <div className={`rounded-3xl p-4 ${portalGlassSectionClass}`}>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Verify</div>
                  <div className="mt-3 text-sm text-zinc-600">After DNS propagates, verify here and the live blog will switch to your custom domain.</div>
                  <button
                    type="button"
                    disabled={domainVerifyBusy || !site?.id || !normalizeDomain(domainDraft || siteDomain || site?.primaryDomain)}
                    onClick={() => void verifyCustomDomain(domainDraft || siteDomain || site?.primaryDomain || "")}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-linear-to-r from-fuchsia-500 via-sky-500 to-cyan-400 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(14,165,233,0.28)] hover:opacity-95 disabled:opacity-60"
                  >
                    {domainVerifyBusy ? "Verifying…" : "Verify now"}
                  </button>

                  {domainVerificationMessage ? (
                    <div
                      className={
                        "mt-4 rounded-2xl border p-3 text-sm " +
                        (domainVerificationTone === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : domainVerificationTone === "warning"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-zinc-200 bg-white/60 text-zinc-700")
                      }
                    >
                      {domainVerificationMessage}
                    </div>
                  ) : null}

                  {domainVerificationDetails ? (
                    <div className="mt-4 space-y-3 text-xs text-zinc-600">
                      <div>
                        <div className="font-semibold text-zinc-700">Expected TXT name</div>
                        <div className="mt-1 break-all font-mono">{domainVerificationDetails.recordName}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-700">Expected TXT value</div>
                        <div className="mt-1 break-all font-mono">{domainVerificationDetails.expected}</div>
                      </div>
                      {domainVerificationDetails.found?.length ? (
                        <div>
                          <div className="font-semibold text-zinc-700">TXT values found</div>
                          <div className="mt-1 space-y-1">
                            {domainVerificationDetails.found.map((value) => (
                              <div key={value} className="break-all font-mono">{value}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                    <div className="font-semibold text-zinc-900">Close from the X in the corner</div>
                    <div className="mt-1">This verification sheet stays open by design while you copy DNS values. Once the domain is saved or verified, close it with the X.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {openPostMenu && openPostMenuPost && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-30">
              <div className="absolute inset-0" onMouseDown={() => setOpenPostMenu(null)} onTouchStart={() => setOpenPostMenu(null)} />
              <LiquidGlassPopupSurface
                className="fixed z-40 w-56 p-1.5"
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
                        className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-white/16"
                        onClick={() => {
                          setOpenPostMenu(null);
                          router.push(`${appBase}/services/blogs/${p.id}`, { scroll: false });
                        }}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <span className="inline-flex items-center gap-2" aria-hidden="true">
                          <IconEdit size={16} />
                          <span>Edit</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={!canViewLive}
                        className={classNames(
                          "w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors duration-150 hover:bg-white/16",
                          (canViewLive ? "text-zinc-900" : "text-zinc-400")
                        )}
                        onClick={() => {
                          if (!canViewLive || !livePath) return;
                          setOpenPostMenu(null);
                          window.open(livePath, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconGlobeGlyph size={16} />
                          <span>View live</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
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
                        className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-rose-700 transition-colors duration-150 hover:bg-rose-500/10"
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
              </LiquidGlassPopupSurface>
            </div>,
            document.body,
          )
        : null}

      {openPreviewMenu && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-30">
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
                      href: hasVerifiedCustomDomain ? `https://${site.primaryDomain}/blogs` : null,
                      disabled: !hasVerifiedCustomDomain,
                      hint:
                        hasVerifiedCustomDomain
                          ? "Live"
                          : "Pending DNS verification",
                    });
                  }

                  const selected = normalizeDomain(siteDomain);
                  const selectedIsDifferent = selected && selected !== normalizeDomain(site?.primaryDomain);
                  if (selected && selectedIsDifferent) {
                    items.push({
                      label: `Custom domain (selected): ${selected}`,
                      href: null,
                      disabled: true,
                      hint:
                        "Selected here, but not saved to Blogs yet",
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
            if (!site) {
              onTabChange("settings");
              return;
            }
            void newDraft();
          }}
        >
          {site ? "+ New blog" : "Finish setup"}
        </button>
      ) : null}
    </div>
  );
}
