"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";
import { RichTextMarkdownEditor } from "@/components/RichTextMarkdownEditor";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { ContactTagsEditor, type ContactTag } from "@/components/ContactTagsEditor";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { InlineSpinner } from "@/components/InlineSpinner";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

type AudienceTab = "external" | "internal";

type Site = {
  id: string;
  name: string;
  slug: string | null;
  primaryDomain: string | null;
  verificationToken: string;
  verifiedAt: string | null;
  updatedAt: string;
};

type Settings = {
  enabled: boolean;
  frequencyDays: number;
  cursor: number;
  requireApproval: boolean;
  channels: { email: boolean; sms: boolean };
  topics: string[];
  promptAnswers: Record<string, string>;
  deliveryEmailHint?: string;
  deliverySmsHint?: string;
  includeImages?: boolean;
  royaltyFreeImages?: boolean;
  includeImagesWhereNeeded?: boolean;
  fontKey?: string;
  audience: { tagIds: string[]; contactIds: string[]; emails: string[]; userIds: string[]; sendAllUsers?: boolean };
  lastGeneratedAt: string | null;
  nextDueAt: string | null;
};

type Tag = { id: string; name: string; color: string | null };

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tags: ContactTag[];
};

type NewsletterRow = {
  id: string;
  kind: "EXTERNAL" | "INTERNAL";
  status: "DRAFT" | "READY" | "SENT";
  slug: string;
  title: string;
  excerpt: string;
  sentAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

type FunnelBuilderDomain = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED";
  verifiedAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
}

function normalizeTopicHints(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 50) break;
  }
  return out;
}

function splitEmails(value: string): string[] {
  const raw = (value || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 200) break;
  }
  return out;
}

function isEmail(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function buildNewsletterEmailPreview(opts: { excerpt: string; link: string }) {
  return [opts.excerpt, "", `Read online: ${opts.link}`, "", "-", "Sent via Purely Automation"].join("\n");
}

function buildNewsletterSmsPreview(opts: { smsText: string | null; link: string }) {
  const baseText = (opts.smsText || "New newsletter is ready.").trim() || "New newsletter is ready.";
  return `${baseText} ${opts.link}`.slice(0, 900);
}

export function PortalNewsletterClient({ initialAudience }: { initialAudience: AudienceTab }) {
  const toast = useToast();

  const router = useRouter();
  const pathname = usePathname();

  const basePath = useMemo(() => {
    const p = String(pathname || "/portal/app/services/newsletter");
    if (p.endsWith("/external")) return p.slice(0, -"/external".length);
    if (p.endsWith("/internal")) return p.slice(0, -"/internal".length);
    return p;
  }, [pathname]);

  const isPaMobileApp = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    const byParam = (sp.get("pa_mobileapp") || "").trim() === "1";
    const byHost = String(window.location.hostname || "").toLowerCase().includes("purely-mobile");
    return byParam || byHost;
  }, []);

  const audienceRef = useRef<AudienceTab>(initialAudience);

  const [audience, setAudience] = useState<AudienceTab>(initialAudience);
  const [tab, setTab] = useState<"newsletters" | "settings">("newsletters");

  useEffect(() => {
    audienceRef.current = initialAudience;
    setAudience(initialAudience);
  }, [initialAudience]);

  const [composerOpen, setComposerOpen] = useState(false);

  const [site, setSite] = useState<Site | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const lastSavedSettingsJsonRef = useRef<{ external: string; internal: string }>({ external: "null", internal: "null" });
  const [settingsCache, setSettingsCache] = useState<{ external: Settings | null; internal: Settings | null }>({
    external: null,
    internal: null,
  });
  const settingsCacheRef = useRef(settingsCache);
  useEffect(() => {
    settingsCacheRef.current = settingsCache;
  }, [settingsCache]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newsletters, setNewsletters] = useState<NewsletterRow[]>([]);
  const [newslettersCache, setNewslettersCache] = useState<{ external: NewsletterRow[]; internal: NewsletterRow[] }>({
    external: [],
    internal: [],
  });
  const newslettersCacheRef = useRef(newslettersCache);
  useEffect(() => {
    newslettersCacheRef.current = newslettersCache;
  }, [newslettersCache]);

  const [credits, setCredits] = useState<number | null>(null);
  const [creditsUsed30d, setCreditsUsed30d] = useState<number | null>(null);
  const [generations30d, setGenerations30d] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [mode, setMode] = useState<"ai" | "manual">("ai");

  const [tagSearch, setTagSearch] = useState("");
  const [addTagValue, setAddTagValue] = useState("");
  const [showCreateTag, setShowCreateTag] = useState(false);

  const [contactSearchOpen, setContactSearchOpen] = useState(false);

  const [aiStep, setAiStep] = useState<"delivery" | "styling" | "guided" | "topics" | "review">("delivery");

  const [frequencyCount, setFrequencyCount] = useState<number>(1);
  const [frequencyUnit, setFrequencyUnit] = useState<"days" | "weeks" | "months">("weeks");

  const [manualTitle, setManualTitle] = useState("");
  const [manualExcerpt, setManualExcerpt] = useState("");
  const [manualSmsText, setManualSmsText] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualCreating, setManualCreating] = useState(false);

  const [manualAssetAlt, setManualAssetAlt] = useState("");
  const [manualAssetUrl, setManualAssetUrl] = useState<string | null>(null);
  const [manualAssetFileName, setManualAssetFileName] = useState<string>("");
  const [manualAssetBusy, setManualAssetBusy] = useState(false);
  const [manualAssetPickerOpen, setManualAssetPickerOpen] = useState(false);
  const [manualImageSearch, setManualImageSearch] = useState("");
  const [manualImageResolvedQuery, setManualImageResolvedQuery] = useState<string | null>(null);
  const [manualImageSearching, setManualImageSearching] = useState(false);
  const [manualImageResults, setManualImageResults] = useState<Array<{ url: string; thumbUrl: string; title: string; sourcePage: string }>>([]);
  const [manualImagePreview, setManualImagePreview] = useState<{ url: string; thumbUrl: string; title: string; sourcePage: string } | null>(null);
  const [manualImagePreviewOpen, setManualImagePreviewOpen] = useState(false);
  const [manualImageImporting, setManualImageImporting] = useState(false);

  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [createTagBusy, setCreateTagBusy] = useState(false);

  const [contactQuery, setContactQuery] = useState("");
  const [contactSearching, setContactSearching] = useState(false);
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);

  const [internalEmailInput, setInternalEmailInput] = useState("");

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<NewsletterRow["status"]>("DRAFT");
  const [draftSlug, setDraftSlug] = useState<string>("");
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftExcerpt, setDraftExcerpt] = useState<string>("");
  const [draftContent, setDraftContent] = useState<string>("");
  const [draftSmsText, setDraftSmsText] = useState<string>("");

  const [assetAlt, setAssetAlt] = useState("");
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [assetFileName, setAssetFileName] = useState<string>("");
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const [siteConfigOpen, setSiteConfigOpen] = useState(false);
  const [siteConfigBusy, setSiteConfigBusy] = useState(false);
  const [siteConfigName, setSiteConfigName] = useState("Newsletter site");
  const [siteConfigSlug, setSiteConfigSlug] = useState("");
  const [siteConfigDomain, setSiteConfigDomain] = useState("");
  const lastSavedSiteConfigSigRef = useRef<string>("");
  const siteConfigSig = useMemo(() => {
    return JSON.stringify({
      name: siteConfigName.trim(),
      slug: siteConfigSlug.trim(),
      primaryDomain: siteConfigDomain.trim(),
    });
  }, [siteConfigDomain, siteConfigName, siteConfigSlug]);
  const siteConfigDirty = siteConfigSig !== lastSavedSiteConfigSigRef.current;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPaMobileApp) return;

    const root = document.documentElement;
    const shouldHideFloatingTools = (composerOpen && mode === "manual") || draftOpen;
    if (shouldHideFloatingTools) root.setAttribute("data-pa-hide-floating-tools", "1");
    else root.removeAttribute("data-pa-hide-floating-tools");

    return () => {
      root.removeAttribute("data-pa-hide-floating-tools");
    };
  }, [composerOpen, draftOpen, isPaMobileApp, mode]);

  const [funnelDomains, setFunnelDomains] = useState<FunnelBuilderDomain[] | null>(null);
  const [funnelDomainsBusy, setFunnelDomainsBusy] = useState(false);

  const siteHandle = useMemo(() => {
    if (!site) return null;
    return site.slug ?? site.id;
  }, [site]);

  const publicBasePath = useMemo(() => {
    if (!siteHandle) return null;
    return audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`;
  }, [audience, siteHandle]);

  const publicBaseUrl = useMemo(() => {
    if (!publicBasePath) return null;
    return toPurelyHostedUrl(publicBasePath);
  }, [publicBasePath]);

  const normalizedPrimaryDomain = useMemo(() => {
    const raw = String(site?.primaryDomain || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.replace(/:\d+$/, "")
      ?.replace(/\.$/, "");
    return raw ? raw : null;
  }, [site?.primaryDomain]);

  const normalizedDomainApex = useCallback((raw: string) => {
    const v = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.replace(/:\d+$/, "")
      ?.replace(/\.$/, "");
    if (!v) return "";
    return v.startsWith("www.") ? v.slice(4) : v;
  }, []);

  const primaryDomainStatus = useMemo(() => {
    if (!normalizedPrimaryDomain) return null;

    const apex = normalizedDomainApex(normalizedPrimaryDomain);
    const match = (funnelDomains || []).find((d) => normalizedDomainApex(d.domain) === apex);
    if (match) return match.status;

    // Fallback for older blog-style verification.
    if (site?.verifiedAt) return "VERIFIED";
    return null;
  }, [funnelDomains, normalizedDomainApex, normalizedPrimaryDomain, site?.verifiedAt]);

  const customHostedBaseUrl = useMemo(() => {
    if (!normalizedPrimaryDomain) return null;
    if (primaryDomainStatus !== "VERIFIED") return null;
    return `https://${normalizedPrimaryDomain}`;
  }, [normalizedPrimaryDomain, primaryDomainStatus]);

  const customPublicBasePath = useMemo(() => {
    // Hosted pages exist for both external and internal newsletters.
    return audience === "internal" ? "/internal-newsletters" : "/newsletters";
  }, [audience]);

  const customPublicBaseUrl = useMemo(() => {
    if (!customHostedBaseUrl || !customPublicBasePath) return null;
    return `${customHostedBaseUrl}${customPublicBasePath}`;
  }, [customHostedBaseUrl, customPublicBasePath]);

  const livePublicBaseUrl = useMemo(() => {
    return customPublicBaseUrl || publicBaseUrl;
  }, [customPublicBaseUrl, publicBaseUrl]);

  const refresh = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    let didLoad = false;

    try {

    const [
      siteRes,
      settingsExternalRes,
      settingsInternalRes,
      tagsRes,
      creditsRes,
      usageRes,
      listExternalRes,
      listInternalRes,
      funnelDomainsRes,
    ] = await Promise.all([
      fetch("/api/portal/newsletter/site", { cache: "no-store" }),
      fetch("/api/portal/newsletter/automation/settings?kind=external", { cache: "no-store" }),
      fetch("/api/portal/newsletter/automation/settings?kind=internal", { cache: "no-store" }),
      fetch("/api/portal/contact-tags", { cache: "no-store" }),
      fetch("/api/portal/credits", { cache: "no-store" }),
      fetch("/api/portal/newsletter/usage?range=30d", { cache: "no-store" }),
      fetch("/api/portal/newsletter/newsletters?kind=external&take=100", { cache: "no-store" }),
      fetch("/api/portal/newsletter/newsletters?kind=internal&take=100", { cache: "no-store" }),
      fetch("/api/portal/funnel-builder/domains", { cache: "no-store" }).catch(() => null as any),
    ]);

    const siteJson = (await siteRes.json().catch(() => ({}))) as any;
    const settingsExternalJson = (await settingsExternalRes.json().catch(() => ({}))) as any;
    const settingsInternalJson = (await settingsInternalRes.json().catch(() => ({}))) as any;
    const tagsJson = (await tagsRes.json().catch(() => ({}))) as any;
    const creditsJson = (await creditsRes.json().catch(() => ({}))) as any;
    const usageJson = (await usageRes.json().catch(() => ({}))) as any;
    const listExternalJson = (await listExternalRes.json().catch(() => ({}))) as any;
    const listInternalJson = (await listInternalRes.json().catch(() => ({}))) as any;
    const funnelDomainsJson = funnelDomainsRes ? (((await funnelDomainsRes.json().catch(() => ({}))) as any) ?? {}) : {};

      if (!siteRes.ok) toast.error(siteJson?.error ?? "Unable to load newsletter site");
      if (!settingsExternalRes.ok) toast.error(settingsExternalJson?.error ?? "Unable to load newsletter settings");
      if (!settingsInternalRes.ok) toast.error(settingsInternalJson?.error ?? "Unable to load newsletter settings");
      if (!tagsRes.ok) toast.error(tagsJson?.error ?? "Unable to load contact tags");

      if (siteRes.ok) {
        setSite(siteJson?.site ?? null);
        didLoad = true;
      }

    if (funnelDomainsRes && funnelDomainsRes.ok && funnelDomainsJson?.ok === true) {
      setFunnelDomains(Array.isArray(funnelDomainsJson.domains) ? (funnelDomainsJson.domains as FunnelBuilderDomain[]) : []);
    } else {
      setFunnelDomains((prev) => (prev === null ? [] : prev));
    }

    const prevSettingsCache = settingsCacheRef.current;
    const nextSettingsCache = {
      external: prevSettingsCache.external,
      internal: prevSettingsCache.internal,
    };
    if (settingsExternalRes.ok && settingsExternalJson?.settings) nextSettingsCache.external = settingsExternalJson.settings as Settings;
    if (settingsInternalRes.ok && settingsInternalJson?.settings) nextSettingsCache.internal = settingsInternalJson.settings as Settings;
    setSettingsCache(nextSettingsCache);
    setSettings(nextSettingsCache[audienceRef.current] ?? null);

    if (settingsExternalRes.ok && settingsExternalJson?.settings) {
      lastSavedSettingsJsonRef.current.external = JSON.stringify(nextSettingsCache.external);
    }
    if (settingsInternalRes.ok && settingsInternalJson?.settings) {
      lastSavedSettingsJsonRef.current.internal = JSON.stringify(nextSettingsCache.internal);
    }

    if (tagsRes.ok) setTags(Array.isArray(tagsJson?.tags) ? tagsJson.tags : []);

    if (creditsRes.ok) {
      setCredits(typeof creditsJson?.credits === "number" ? creditsJson.credits : 0);
    }

    if (usageRes.ok) {
      setCreditsUsed30d(typeof usageJson?.creditsUsed?.range === "number" ? usageJson.creditsUsed.range : 0);
      setGenerations30d(typeof usageJson?.generations?.range === "number" ? usageJson.generations.range : 0);
    }

    const prevNewslettersCache = newslettersCacheRef.current;
    const nextNewslettersCache = {
      external: prevNewslettersCache.external,
      internal: prevNewslettersCache.internal,
    };
    if (listExternalRes.ok) {
      nextNewslettersCache.external = Array.isArray(listExternalJson?.newsletters)
        ? (listExternalJson.newsletters as NewsletterRow[])
        : [];
    }
    if (listInternalRes.ok) {
      nextNewslettersCache.internal = Array.isArray(listInternalJson?.newsletters)
        ? (listInternalJson.newsletters as NewsletterRow[])
        : [];
    }
    setNewslettersCache(nextNewslettersCache);
    setNewsletters(nextNewslettersCache[audienceRef.current] ?? []);

      if (didLoad) hasLoadedOnceRef.current = true;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const isDirty = useMemo(() => {
    if (!settings) return false;
    const key = audience === "internal" ? "internal" : "external";
    return JSON.stringify(settings) !== lastSavedSettingsJsonRef.current[key];
  }, [audience, settings]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    audienceRef.current = audience;
    setSettings(settingsCache[audience] ?? null);
    setNewsletters(newslettersCache[audience] ?? []);
  }, [audience, newslettersCache, settingsCache]);

  const setAudienceAndRoute = useCallback(
    (next: AudienceTab) => {
      setAudience(next);
      router.replace(`${basePath}/${next}`);
    },
    [basePath, router],
  );

  useEffect(() => {
    if (aiStep === "styling" && !settings) setAiStep("delivery");
  }, [aiStep, settings]);

  useEffect(() => {
    if (!siteConfigOpen) return;
    if (funnelDomains && funnelDomains.length) return;
    let mounted = true;

    (async () => {
      setFunnelDomainsBusy(true);
      try {
        const res = await fetch("/api/portal/funnel-builder/domains", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!mounted) return;
        if (!res.ok || json?.ok !== true) {
          setFunnelDomains([]);
          return;
        }
        setFunnelDomains(Array.isArray(json.domains) ? (json.domains as FunnelBuilderDomain[]) : []);
      } catch {
        if (!mounted) return;
        setFunnelDomains([]);
      } finally {
        if (!mounted) return;
        setFunnelDomainsBusy(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [funnelDomains, siteConfigOpen]);

  useEffect(() => {
    const days = Math.max(1, Math.floor(Number(settings?.frequencyDays) || 7));
    if (days % 30 === 0) {
      setFrequencyUnit("months");
      setFrequencyCount(Math.max(1, Math.floor(days / 30)));
      return;
    }
    if (days % 7 === 0) {
      setFrequencyUnit("weeks");
      setFrequencyCount(Math.max(1, Math.floor(days / 7)));
      return;
    }
    setFrequencyUnit("days");
    setFrequencyCount(days);
  }, [settings?.frequencyDays]);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSaving(true);

    const maxFrequencyDays = 365;
    const normalizedFrequencyDays = Math.max(1, Math.min(maxFrequencyDays, Math.floor(Number(settings.frequencyDays) || 7)));

    const res = await fetch("/api/portal/newsletter/automation/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: audience,
        enabled: Boolean(settings.enabled),
        frequencyDays: normalizedFrequencyDays,
        requireApproval: Boolean(settings.requireApproval),
        channels: settings.channels,
        topics: normalizeTopicHints(settings.topics),
        promptAnswers: settings.promptAnswers,
        deliveryEmailHint: settings.deliveryEmailHint ?? "",
        deliverySmsHint: settings.deliverySmsHint ?? "",
        includeImages: Boolean(settings.includeImages),
        royaltyFreeImages: Boolean(settings.royaltyFreeImages ?? true),
        includeImagesWhereNeeded: Boolean(settings.includeImagesWhereNeeded),
        fontKey: (settings.fontKey ?? "brand") as any,
        audience: settings.audience,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) toast.error(json?.error ?? "Failed to save");
    else toast.success("Saved");

    setSaving(false);
    await refresh();
  }, [audience, refresh, settings, toast]);

  const searchManualImages = useCallback(async () => {
    const prompt = manualImageSearch.trim();
    if (prompt.length < 2) {
      setManualImageResults([]);
      setManualImageResolvedQuery(null);
      return;
    }
    setManualImageSearching(true);
    try {
      const res = await fetch("/api/portal/newsletter/royalty-free-images/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, take: 10 }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !Array.isArray(json?.images)) {
        setManualImageResults([]);
        setManualImageResolvedQuery(null);
        return;
      }
      setManualImageResolvedQuery(typeof json?.query === "string" ? String(json.query) : null);
      setManualImageResults(
        json.images
          .map((i: any) => ({
            url: String(i?.url || ""),
            thumbUrl: String(i?.thumbUrl || i?.url || ""),
            title: String(i?.title || ""),
            sourcePage: String(i?.sourcePage || ""),
          }))
          .filter((i: any) => i.url && i.thumbUrl),
      );
    } finally {
      setManualImageSearching(false);
    }
  }, [manualImageSearch]);

  const createOwnerTag = useCallback(async () => {
    const name = createTagName.trim().slice(0, 60);
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    setCreateTagBusy(true);
    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color: createTagColor }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !json?.tag?.id) {
        toast.error(String(json?.error || "Failed to create tag"));
        return;
      }

      const created: Tag = {
        id: String(json.tag.id),
        name: String(json.tag.name || name).slice(0, 60),
        color: typeof json.tag.color === "string" ? String(json.tag.color) : null,
      };

      setTags((prev) => {
        const next = [...prev.filter((t) => t.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });

      setSettings((prev) => {
        if (!prev) return prev;
        const next = new Set(prev.audience.tagIds);
        next.add(created.id);
        return { ...prev, audience: { ...prev.audience, tagIds: Array.from(next).slice(0, 200) } };
      });

      setCreateTagName("");
      setCreateTagColor("#2563EB");
      setShowCreateTag(false);
      setAddTagValue("");
      toast.success("Tag created");
    } finally {
      setCreateTagBusy(false);
    }
  }, [createTagColor, createTagName, toast]);

  useEffect(() => {
    // For external newsletters, fetch details for selected contacts so we can show a readable list.
    if (audience !== "external") {
      setSelectedContacts([]);
      return;
    }
    const ids = (settings?.audience?.contactIds || []).filter(Boolean);
    if (!ids.length) {
      setSelectedContacts([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/portal/newsletter/audience/contacts?ids=${encodeURIComponent(ids.join(","))}&take=200`, {
        cache: "no-store",
      }).catch(() => null as any);
      const json = (await res?.json().catch(() => ({}))) as any;
      if (cancelled) return;
      if (!res?.ok || !json?.ok || !Array.isArray(json?.contacts)) {
        return;
      }
      setSelectedContacts(
        json.contacts
          .map((c: any) => ({
            id: String(c?.id || ""),
            name: c?.name ? String(c.name) : null,
            email: c?.email ? String(c.email) : null,
            phone: c?.phone ? String(c.phone) : null,
            tags: Array.isArray(c?.tags)
              ? c.tags
                  .map((t: any) => ({ id: String(t?.id || ""), name: String(t?.name || "").slice(0, 60), color: typeof t?.color === "string" ? String(t.color) : null }))
                  .filter((t: ContactTag) => t.id && t.name)
              : [],
          }))
          .filter((c: Contact) => Boolean(c.id)),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [audience, settings?.audience?.contactIds]);

  useEffect(() => {
    // Contact search (debounced).
    if (audience !== "external") {
      setContactResults([]);
      return;
    }
    const q = contactQuery.trim();
    if (q.length < 2) {
      setContactResults([]);
      return;
    }

    let cancelled = false;
    setContactSearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/portal/newsletter/audience/contacts?q=${encodeURIComponent(q)}&take=50`, { cache: "no-store" }).catch(() => null as any);
        const json = (await res?.json().catch(() => ({}))) as any;
        if (cancelled) return;
        if (!res?.ok || !json?.ok || !Array.isArray(json?.contacts)) {
          setContactResults([]);
          setContactSearching(false);
          return;
        }
        setContactResults(
          json.contacts
            .map((c: any) => ({
              id: String(c?.id || ""),
              name: c?.name ? String(c.name) : null,
              email: c?.email ? String(c.email) : null,
              phone: c?.phone ? String(c.phone) : null,
              tags: Array.isArray(c?.tags)
                ? c.tags
                    .map((t: any) => ({ id: String(t?.id || ""), name: String(t?.name || "").slice(0, 60), color: typeof t?.color === "string" ? String(t.color) : null }))
                    .filter((t: ContactTag) => t.id && t.name)
                : [],
            }))
            .filter((c: Contact) => Boolean(c.id)),
        );
        setContactSearching(false);
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [audience, contactQuery]);

  const openDraft = useCallback(async (newsletterId: string) => {
    setDraftOpen(true);
    setDraftLoading(true);
    setDraftError(null);
    setDraftId(newsletterId);
    setAssetAlt("");
    setAssetUrl(null);
    setAssetFileName("");

    const res = await fetch(`/api/portal/newsletter/newsletters/${encodeURIComponent(newsletterId)}`, { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => ({}))) as any;
    if (!res?.ok || !json?.ok || !json?.newsletter?.id) {
      setDraftError(String(json?.error || "Failed to load draft"));
      setDraftLoading(false);
      return;
    }

    const n = json.newsletter;
    setDraftStatus(String(n.status || "DRAFT") as any);
    setDraftSlug(String(n.slug || ""));
    setDraftTitle(String(n.title || ""));
    setDraftExcerpt(String(n.excerpt || ""));
    setDraftContent(String(n.content || ""));
    setDraftSmsText(String(n.smsText || ""));
    setDraftLoading(false);
  }, []);

  const createManual = useCallback(
    async (status: "DRAFT" | "READY") => {
      if (!manualTitle.trim()) {
        toast.error("Title is required");
        return;
      }

      setManualCreating(true);
      try {
        const res = await fetch("/api/portal/newsletter/newsletters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: audience,
            status,
            title: manualTitle,
            excerpt: manualExcerpt,
            content: manualContent,
            smsText: manualSmsText || null,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok || !json?.newsletter?.id) {
          toast.error(String(json?.error || "Failed to create newsletter"));
          return;
        }
        toast.success(status === "READY" ? "Manual newsletter created (READY)" : "Manual newsletter created");
        const id = String(json.newsletter.id);
        setManualTitle("");
        setManualExcerpt("");
        setManualSmsText("");
        setManualContent("");
        await refresh();
        await openDraft(id);
      } finally {
        setManualCreating(false);
      }
    },
    [audience, manualContent, manualExcerpt, manualSmsText, manualTitle, openDraft, refresh, toast],
  );

  const saveDraft = useCallback(async () => {
    if (!draftId) return;
    setDraftSaving(true);
    setDraftError(null);
    try {
      const hostedOnly = draftStatus === "SENT";
      const res = await fetch(
        `/api/portal/newsletter/newsletters/${encodeURIComponent(draftId)}${hostedOnly ? "?hosted=1" : ""}`,
        {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draftTitle,
          excerpt: draftExcerpt,
          content: draftContent,
          smsText: draftSmsText || null,
        }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) {
        setDraftError(String(json?.error || "Failed to save"));
        return;
      }
      toast.success(hostedOnly ? "Hosted page updated" : "Draft saved");
      await refresh();
    } finally {
      setDraftSaving(false);
    }
  }, [draftContent, draftExcerpt, draftId, draftSmsText, draftStatus, draftTitle, refresh, toast]);

  const insertIntoDraftContent = useCallback((snippet: string) => {
    const s = String(snippet || "").trim();
    if (!s) return;
    setDraftContent((prev) => {
      const p = String(prev || "");
      if (!p.trim()) return `${s}\n`;
      return p.endsWith("\n") ? `${p}\n${s}\n` : `${p}\n\n${s}\n`;
    });
  }, []);

  const generateNow = useCallback(async () => {
    setGenerating(true);

    const res = await fetch("/api/portal/newsletter/automation/generate-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: audience }),
    });

    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      if (json?.error === "INSUFFICIENT_CREDITS") {
        toast.error("Not enough credits. Add credits in Billing.");
      } else {
        toast.error(json?.error ?? "Failed to generate");
      }
      setGenerating(false);
      return;
    }

    toast.success(audience === "internal" ? "Internal newsletter generated" : "Newsletter generated");
    setGenerating(false);
    await refresh();
  }, [audience, refresh, toast]);

  const sendReady = useCallback(async (newsletterId: string) => {
    const ok = window.confirm("Send this newsletter now? This will message your selected audience.");
    if (!ok) return;

    const res = await fetch(`/api/portal/newsletter/newsletters/${newsletterId}/send`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      toast.error(json?.error ?? "Failed to send");
      return;
    }
    toast.success("Sent");
    await refresh();
  }, [refresh, toast]);

  const selectedContactIds = new Set(settings?.audience?.contactIds ?? []);

  const tagById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const addTagOptions = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const selected = new Set(settings?.audience?.tagIds ?? []);
    const filtered = q
      ? tags.filter((t) => t.name.toLowerCase().includes(q))
      : tags;

    const out: Array<{ value: string; label: string; disabled?: boolean; hint?: string }> = [
      { value: "", label: "Add tag…", disabled: true },
      ...filtered
        .slice(0, 120)
        .map((t) => ({
          value: t.id,
          label: t.name,
          hint: selected.has(t.id) ? "Already added" : undefined,
          disabled: selected.has(t.id),
        })),
    ];

    return out as any;
  }, [settings?.audience?.tagIds, tagSearch, tags]);

  const promptFields = useMemo(() => {
    if (audience === "internal") {
      return [
        { key: "updates", label: "What updates should the team know about?" },
        { key: "wins", label: "Any wins/highlights to include?" },
        { key: "issues", label: "Any issues/risks to flag?" },
        { key: "next", label: "What should we do next?" },
      ];
    }
    return [
      { key: "goal", label: "What is the goal of this newsletter?" },
      { key: "audience", label: "Who is this for and what do they care about?" },
      { key: "offer", label: "Any offer/promo (optional)?" },
      { key: "cta", label: "What should they do next?" },
    ];
  }, [audience]);

  const aiStepOrder = ["delivery", "styling", "guided", "topics", "review"] as const;
  const aiStepIndex = Math.max(0, aiStepOrder.indexOf(aiStep));
  const aiStepLabel = (step: (typeof aiStepOrder)[number]) => {
    switch (step) {
      case "delivery":
        return "Delivery";
      case "styling":
        return "Styling";
      case "guided":
        return "Guided prompt";
      case "topics":
        return "Topic hints";
      case "review":
        return "Review";
    }
  };

  const reviewSynopsis = useMemo(() => {
    if (!settings) return "";
    const channelParts = [settings.channels.email ? "Email" : null, settings.channels.sms ? "SMS" : null].filter(Boolean);
    const font = settings.fontKey ?? "brand";
    const enabledLine = settings.enabled ? `Enabled · every ${settings.frequencyDays}d` : "Disabled";
    const approvalLine = settings.requireApproval ? "Requires approval (creates READY drafts)" : "Auto-send (sends immediately)";
    const royaltyFreeImages = settings.royaltyFreeImages ?? true;
    const imagesLine = settings.includeImages
      ? `Images: yes${royaltyFreeImages ? " (royalty-free)" : ""}${settings.includeImagesWhereNeeded ? " (only where needed)" : ""}`
      : "Images: no";
    const topicsCount = (settings.topics ?? []).filter((t) => String(t || "").trim()).length;

    const lines: string[] = [];
    lines.push(audience === "internal" ? "Internal newsletter" : "External newsletter");
    lines.push("");
    lines.push(`Schedule: ${enabledLine}`);
    lines.push(`Approval: ${approvalLine}`);
    lines.push(`Channels: ${channelParts.length ? channelParts.join(" + ") : "None"}`);
    lines.push(`Font: ${font}`);
    lines.push(imagesLine);
    lines.push(`Topic hints: ${topicsCount}`);
    lines.push("");
    lines.push("Delivery guidance");
    lines.push(`- Email: ${(settings.deliveryEmailHint || "(none)").trim().slice(0, 240)}`);
    lines.push(`- SMS: ${(settings.deliverySmsHint || "(none)").trim().slice(0, 240)}`);
    lines.push("");
    lines.push("Guided prompt");
    for (const f of promptFields) {
      const v = (settings.promptAnswers?.[f.key] ?? "").trim();
      if (!v) continue;
      lines.push(`- ${f.label}: ${v.slice(0, 260)}`);
    }
    return lines.join("\n");
  }, [audience, promptFields, settings]);

  const initialLoading =
    loading &&
    !site &&
    !settingsCache.external &&
    !settingsCache.internal &&
    tags.length === 0 &&
    newslettersCache.external.length === 0 &&
    newslettersCache.internal.length === 0;

  if (initialLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {refreshing ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600">
          <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
          Refreshing…
        </div>
      ) : null}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Your newsletters</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Capture leads and reach thousands with curated newsletters from your AI assistant.
          </p>
        </div>

        <div className="w-full sm:w-auto">
          <SuggestedSetupModalLauncher serviceSlugs={["newsletter"]} buttonLabel="Suggested setup" />
        </div>
      </div>

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAudienceAndRoute("external")}
          aria-current={audience === "external" ? "page" : undefined}
          className={
            "flex-1 min-w-40 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (audience === "external"
              ? "border-[color:var(--color-brand-blue)] bg-[color:var(--color-brand-blue)] text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          External
        </button>
        <button
          type="button"
          onClick={() => setAudienceAndRoute("internal")}
          aria-current={audience === "internal" ? "page" : undefined}
          className={
            "flex-1 min-w-40 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (audience === "internal"
              ? "border-[color:var(--color-brand-pink)] bg-[color:var(--color-brand-pink)] text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Internal
        </button>
      </div>

      {tab === "newsletters" ? (
        <>
          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Your newsletters</div>
                <div className="mt-2 text-sm text-zinc-600">Draft, send, and keep your updates organized.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setTab("newsletters")}
                    className="rounded-2xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    Newsletters
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("settings")}
                    className="rounded-2xl px-3 py-2 text-xs font-semibold text-zinc-700 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                  >
                    Settings
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-linear-to-br from-[color:var(--color-brand-mist)] to-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-zinc-600">Total credits</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">{credits === null ? "N/A" : credits.toLocaleString()}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-zinc-600">Newsletter credits used</div>
                <div className="mt-2 text-2xl font-bold text-brand-ink">{creditsUsed30d === null ? "N/A" : creditsUsed30d.toLocaleString()}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Last 30 days · {generations30d === null ? "N/A" : generations30d} generation{generations30d === 1 ? "" : "s"} · 30 credits/generation
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-linear-to-br from-brand-blue/10 via-white to-white p-4 shadow-sm">
                <div className="text-xs font-semibold text-zinc-600">Schedule</div>
                <div className="mt-2 text-sm text-zinc-800">
                  <span className="font-semibold">Last:</span> {formatDate(settings?.lastGeneratedAt ?? null) || "N/A"}
                </div>
                <div className="mt-1 text-sm text-zinc-800">
                  <span className="font-semibold">Next:</span> {formatDate(settings?.nextDueAt ?? null) || "N/A"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">Based on current frequency.</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {!isPaMobileApp ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-90"
                  onClick={() => {
                    setComposerOpen(true);
                    setMode("ai");
                    setAiStep("delivery");
                  }}
                >
                  + New newsletter
                </button>
              ) : null}
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
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
                  {newsletters.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-zinc-600" colSpan={4}>
                        No newsletters yet.
                      </td>
                    </tr>
                  ) : (
                    newsletters.map((n) => {
                      const statusLabel = n.status === "SENT" ? "Sent" : n.status === "READY" ? "Ready" : "Draft";
                      const statusClasses =
                        n.status === "SENT"
                          ? "bg-emerald-50 text-emerald-700"
                          : n.status === "READY"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-zinc-100 text-zinc-700";

                      const publicPath = siteHandle && n.status === "SENT"
                        ? `${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${n.slug}`
                        : null;

                      return (
                        <tr key={n.id} className="border-t border-zinc-200">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => void openDraft(n.id)}
                              className="font-semibold text-brand-ink hover:underline"
                            >
                              {n.title || "(untitled)"}
                            </button>
                            <div className="mt-1 truncate text-xs text-zinc-500">/{n.slug}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={"inline-flex rounded-full px-2 py-1 text-xs font-semibold " + statusClasses}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{formatDate(n.updatedAtIso)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {publicPath ? (
                                <>
                                  <Link
                                    href={publicPath}
                                    target="_blank"
                                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                                  >
                                    Preview
                                  </Link>
                                  <a
                                    href={
                                      customHostedBaseUrl
                                        ? `${customHostedBaseUrl}${audience === "internal" ? "/internal-newsletters" : "/newsletters"}/${n.slug}`
                                        : publicPath
                                    }
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="rounded-2xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-xs font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
                                  >
                                    Live
                                  </a>
                                </>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => void openDraft(n.id)}
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                              >
                                {n.status === "SENT" ? "Edit hosted" : "Edit / preview"}
                              </button>

                              {n.status === "READY" ? (
                                <button
                                  type="button"
                                  onClick={() => void sendReady(n.id)}
                                  className="rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
                                >
                                  Send now
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {composerOpen ? (
            <div
              className={
                mode === "manual"
                  ? "fixed inset-0 z-9997 flex items-stretch justify-center bg-black/40 px-0 pt-[var(--pa-modal-safe-top,0px)] pb-0 sm:px-4"
                  : "fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
              }
              onMouseDown={() => setComposerOpen(false)}
            >
              <div
                className={
                  mode === "manual"
                    ? "w-full h-[calc(100dvh-var(--pa-modal-safe-top,0px))] overflow-hidden bg-white shadow-xl sm:my-4 sm:max-w-5xl sm:max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-2rem)] sm:rounded-3xl sm:border sm:border-zinc-200"
                    : "w-full max-w-5xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl"
                }
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className={
                    mode === "manual"
                      ? "h-full overflow-y-auto p-6"
                      : "max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto p-6"
                  }
                >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Composer</div>
                  <div className="mt-1 text-sm text-zinc-600">Use AI to draft content, or write it manually.</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("ai")}
                    className={
                      "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition " +
                      (mode === "ai"
                        ? "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] text-white shadow-sm hover:opacity-90"
                        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                      <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                    </svg>
                    <span>AI</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("manual")}
                    className={
                      "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition " +
                      (mode === "manual" ? "bg-brand-ink text-white hover:opacity-95" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    <span>Manual</span>
                  </button>

                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={saving || !settings || !isDirty}
                    className={
                      "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold shadow-sm transition " +
                      (saving || !settings || !isDirty
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-90")
                    }
                  >
                    {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setComposerOpen(false)}
                    aria-label="Close composer"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:bg-zinc-50 hover:text-zinc-800"
                  >
                    ×
                  </button>
                </div>
              </div>

          {mode === "manual" ? (
            <div className="mt-3 grid gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Title</label>
                <input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Newsletter title"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Email message (sent with hosted link)</label>
                <textarea
                  value={manualExcerpt}
                  onChange={(e) => setManualExcerpt(e.target.value)}
                  className="mt-1 min-h-22.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Write the email message. The hosted link is appended automatically."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">SMS message (sent with hosted link)</label>
                <input
                  value={manualSmsText}
                  onChange={(e) => setManualSmsText(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="New newsletter is ready."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Hosted page content (Markdown)</label>
                <div className="mt-1">
                  <RichTextMarkdownEditor markdown={manualContent} onChange={setManualContent} placeholder="Write the hosted page…" disabled={manualCreating} />
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Images & files</div>
                <div className="mt-2 text-sm text-zinc-600">Upload, pick from the media library, or generate a royalty-free image suggestion.</div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Alt text (optional)</label>
                    <input
                      value={manualAssetAlt}
                      onChange={(e) => setManualAssetAlt(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="Team photo, product, etc."
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-zinc-600">Selected file</div>
                      {manualAssetUrl ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-zinc-600 hover:underline"
                          onClick={() => {
                            setManualAssetUrl(null);
                            setManualAssetFileName("");
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 break-all">
                      {manualAssetUrl ? manualAssetFileName || manualAssetUrl : "No file selected yet."}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                    {manualAssetBusy ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={manualAssetBusy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setManualAssetBusy(true);
                        try {
                          const fd = new FormData();
                          fd.set("file", file);
                          const up = await fetch("/api/uploads", { method: "POST", body: fd });
                          const upBody = (await up.json().catch(() => ({}))) as any;
                          if (!up.ok || !upBody.url) {
                            toast.error(String(upBody.error || "Upload failed"));
                            return;
                          }
                          setManualAssetUrl(String(upBody.url));
                          setManualAssetFileName(String(upBody.fileName || file.name || "file"));
                        } finally {
                          setManualAssetBusy(false);
                          if (e.target) e.target.value = "";
                        }
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setManualAssetPickerOpen(true)}
                  >
                    Choose from media library
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!manualAssetUrl}
                    className="rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
                    onClick={() => {
                      if (!manualAssetUrl) return;
                      const alt = manualAssetAlt.trim() || "image";
                      setManualContent((prev) => {
                        const p = String(prev || "");
                        const snippet = `![${alt}](${manualAssetUrl})`;
                        if (!p.trim()) return `${snippet}\n`;
                        return p.endsWith("\n") ? `${p}\n${snippet}\n` : `${p}\n\n${snippet}\n`;
                      });
                    }}
                  >
                    Insert image
                  </button>
                  <button
                    type="button"
                    disabled={!manualAssetUrl}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    onClick={() => {
                      if (!manualAssetUrl) return;
                      const label = (manualAssetFileName || manualAssetAlt || "file").trim() || "file";
                      setManualContent((prev) => {
                        const p = String(prev || "");
                        const snippet = `[${label}](${manualAssetUrl})`;
                        if (!p.trim()) return `${snippet}\n`;
                        return p.endsWith("\n") ? `${p}\n${snippet}\n` : `${p}\n\n${snippet}\n`;
                      });
                    }}
                  >
                    Insert link
                  </button>
                </div>

                <PortalMediaPickerModal
                  open={manualAssetPickerOpen}
                  title="Choose a file"
                  confirmLabel="Use"
                  onClose={() => setManualAssetPickerOpen(false)}
                  onPick={(item) => {
                    setManualAssetUrl(item.shareUrl);
                    setManualAssetFileName(String(item.fileName || ""));
                    setManualAssetPickerOpen(false);
                  }}
                />

                {manualImagePreviewOpen && manualImagePreview ? (
                  <div
                    className="fixed inset-0 z-9998 flex items-end justify-center bg-black/40 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
                    onMouseDown={() => {
                      if (manualImageImporting) return;
                      setManualImagePreviewOpen(false);
                    }}
                  >
                    <div
                      className="w-full max-w-3xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">
                            {manualImagePreview.title.replace(/^File:/, "") || "Royalty-free image"}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">Wikimedia Commons</div>
                        </div>
                        <button
                          type="button"
                          aria-label="Close image preview"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-60"
                          onClick={() => setManualImagePreviewOpen(false)}
                          disabled={manualImageImporting}
                        >
                          ×
                        </button>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={manualImagePreview.url || manualImagePreview.thumbUrl}
                          alt={manualImagePreview.title}
                          className="max-h-[70vh] w-full object-contain"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <a
                          className="text-xs font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                          href={manualImagePreview.sourcePage}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View source
                        </a>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                            disabled={manualImageImporting}
                            onClick={() => {
                              setManualAssetUrl(manualImagePreview.url || manualImagePreview.thumbUrl);
                              setManualAssetFileName(
                                (manualImagePreview.title || "")
                                  .replace(/^File:/, "")
                                  .trim()
                                  .slice(0, 120),
                              );
                              setManualImagePreviewOpen(false);
                            }}
                          >
                            Use without saving
                          </button>
                          <button
                            type="button"
                            className="rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                            disabled={manualImageImporting}
                            onClick={async () => {
                              setManualImageImporting(true);
                              try {
                                const fileName = (manualImagePreview.title || "")
                                  .replace(/^File:/, "")
                                  .trim()
                                  .slice(0, 200);
                                const res = await fetch("/api/portal/media/import-remote", {
                                  method: "POST",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({
                                    url: manualImagePreview.url || manualImagePreview.thumbUrl,
                                    fileName: fileName || null,
                                  }),
                                });
                                const json = (await res.json().catch(() => ({}))) as any;
                                if (!res.ok || !json?.ok || !json?.item?.shareUrl) {
                                  toast.error(String(json?.error || "Import failed"));
                                  return;
                                }
                                setManualAssetUrl(String(json.item.shareUrl));
                                setManualAssetFileName(fileName || "image");
                                toast.success("Added to Media Library");
                                setManualImagePreviewOpen(false);
                              } finally {
                                setManualImageImporting(false);
                              }
                            }}
                          >
                            Use + add to Media Library
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Generate an image (royalty-free)</div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={manualImageSearch}
                      onChange={(e) => setManualImageSearch(e.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="Describe the image (e.g. 'friendly team photo', 'roof inspection', 'plumbing tools')"
                    />
                    <button
                      type="button"
                      className="rounded-2xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                      onClick={() => void searchManualImages()}
                      disabled={manualImageSearching}
                    >
                      {manualImageSearching ? "Generating…" : "Generate"}
                    </button>
                  </div>
                  {manualImageResolvedQuery ? (
                    <div className="mt-2 text-xs text-zinc-600">Searching Wikimedia for: {manualImageResolvedQuery}</div>
                  ) : null}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {manualImageResults.slice(0, 6).map((img) => (
                      <button
                        key={img.url}
                        type="button"
                        className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-2 text-left hover:bg-zinc-50"
                        onClick={() => {
                          setManualImagePreview(img);
                          setManualImagePreviewOpen(true);
                        }}
                        title={img.sourcePage}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.thumbUrl} alt={img.title} className="h-14 w-14 rounded-xl object-cover" />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-zinc-900">{img.title.replace(/^File:/, "")}</div>
                          <div className="truncate text-[11px] text-zinc-500">Wikimedia Commons</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Images are sourced from Wikimedia Commons.</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                  onClick={() => void createManual("DRAFT")}
                  disabled={manualCreating}
                >
                  {manualCreating ? "Working…" : "Create draft"}
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  onClick={() => void createManual("READY")}
                  disabled={manualCreating}
                >
                  {manualCreating ? "Working…" : "Create READY"}
                </button>
              </div>
            </div>
          ) : null}

          {mode === "ai" ? (
            <>
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex flex-wrap gap-2">
                  {aiStepOrder.map((s, idx) => {
                    const active = s === aiStep;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setAiStep(s)}
                        className={
                          "rounded-2xl border px-3 py-2 text-xs font-semibold transition " +
                          (active
                            ? "border-brand-ink bg-brand-ink text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                        }
                      >
                        {idx + 1}. {aiStepLabel(s)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {aiStep === "delivery" ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 sm:col-span-2">
                    <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                      <div>
                        <div className="text-sm font-semibold text-zinc-800">Skip to the end</div>
                        <div className="mt-1 text-xs text-zinc-600">Skip to Review to generate this whole thing with AI.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiStep("review")}
                        className="rounded-2xl bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                      >
                        Skip to Review
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-800">Enabled</div>
                      <div className="mt-1 text-xs text-zinc-500">Runs on schedule when enabled.</div>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(settings?.enabled)}
                      onChange={(checked) => setSettings((prev) => (prev ? { ...prev, enabled: checked } : prev))}
                      ariaLabel="Enable newsletter automation"
                    />
                  </label>

                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Frequency</div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={frequencyCount}
                        onChange={(e) => {
                          const maxFrequencyDays = 365;
                          const raw = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          const nextCount = Math.min(365, raw);
                          const unit = frequencyUnit;
                          const days =
                            unit === "months"
                              ? nextCount * 30
                              : unit === "weeks"
                                ? nextCount * 7
                                : nextCount;
                          setFrequencyCount(nextCount);
                          setSettings((prev) => (prev ? { ...prev, frequencyDays: Math.max(1, Math.min(maxFrequencyDays, days)) } : prev));
                        }}
                        className="w-28 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      />
                      <div className="min-w-36 flex-1">
                        <PortalListboxDropdown
                          value={frequencyUnit as any}
                          options={
                            [
                              { value: "days", label: "Days" },
                              { value: "weeks", label: "Weeks" },
                              { value: "months", label: "Months" },
                            ] as any
                          }
                          onChange={(v) => {
                            const unit = v === "months" || v === "weeks" || v === "days" ? (v as any) : "weeks";
                            const maxFrequencyDays = 365;
                            const days =
                              unit === "months"
                                ? frequencyCount * 30
                                : unit === "weeks"
                                  ? frequencyCount * 7
                                  : frequencyCount;
                            setFrequencyUnit(unit);
                            setSettings((prev) => (prev ? { ...prev, frequencyDays: Math.max(1, Math.min(maxFrequencyDays, days)) } : prev));
                          }}
                          placeholder="Unit"
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">Stored as days for scheduling.</div>
                  </div>

                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-800">Require approval</div>
                      <div className="mt-1 text-xs text-zinc-500">If enabled, scheduled runs create READY drafts you manually send.</div>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(settings?.requireApproval)}
                      onChange={(checked) => setSettings((prev) => (prev ? { ...prev, requireApproval: checked } : prev))}
                      ariaLabel="Require approval before scheduled sends"
                    />
                  </label>

                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Channels</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label
                        className={
                          "inline-flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition " +
                          (settings?.channels?.email
                            ? "border-[color:var(--color-brand-blue)] bg-[color:var(--color-brand-mist)] text-brand-ink"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                        }
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={Boolean(settings?.channels?.email)}
                          onChange={(e) =>
                            setSettings((prev) => (prev ? { ...prev, channels: { ...prev.channels, email: e.target.checked } } : prev))
                          }
                        />
                        <span
                          aria-hidden="true"
                          className={
                            "h-2.5 w-2.5 rounded-full " +
                            (settings?.channels?.email ? "bg-[color:var(--color-brand-blue)]" : "bg-zinc-300")
                          }
                        />
                        Email
                      </label>

                      <label
                        className={
                          "inline-flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition " +
                          (settings?.channels?.sms
                            ? "border-[color:var(--color-brand-blue)] bg-[color:var(--color-brand-mist)] text-brand-ink"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                        }
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={Boolean(settings?.channels?.sms)}
                          onChange={(e) =>
                            setSettings((prev) => (prev ? { ...prev, channels: { ...prev.channels, sms: e.target.checked } } : prev))
                          }
                        />
                        <span
                          aria-hidden="true"
                          className={
                            "h-2.5 w-2.5 rounded-full " +
                            (settings?.channels?.sms ? "bg-[color:var(--color-brand-blue)]" : "bg-zinc-300")
                          }
                        />
                        SMS (link)
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 sm:col-span-2">
                    <div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Delivery copy (AI)</div>
                        <div className="mt-1 text-xs text-zinc-500">Guide the tone and length. The system appends the hosted link.</div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <div className="text-xs font-semibold text-zinc-600">Email message guidance</div>
                        <textarea
                          value={settings?.deliveryEmailHint ?? ""}
                          onChange={(e) =>
                            setSettings((prev) => (prev ? { ...prev, deliveryEmailHint: e.target.value.slice(0, 1500) } : prev))
                          }
                          rows={3}
                          className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                          placeholder="Example: Keep it short. Mention the key value + 1 clear CTA."
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-semibold text-zinc-600">SMS message guidance</div>
                        <textarea
                          value={settings?.deliverySmsHint ?? ""}
                          onChange={(e) => setSettings((prev) => (prev ? { ...prev, deliverySmsHint: e.target.value.slice(0, 800) } : prev))}
                          rows={3}
                          className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                          placeholder="Example: Under 140 characters if possible. Direct and friendly."
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              {aiStep === "styling" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-zinc-900">Styling (AI)</div>
                  <div className="mt-1 text-sm text-zinc-600">Choose how the hosted page should look. Email/SMS are sent as plain text.</div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Font (hosted page)</div>
                      <div className="mt-2">
                        <PortalFontDropdown
                          value={String(settings?.fontKey ?? "brand")}
                          onChange={(v) => setSettings((prev) => (prev ? { ...prev, fontKey: v } : prev))}
                          extraOptions={[
                            { value: "brand", label: "Brand" },
                            { value: "sans", label: "Sans" },
                            { value: "mono", label: "Mono" },
                          ]}
                          className="w-full"
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          placeholder="Font"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Images</div>
                      <div className="mt-2 grid gap-3">
                        <label className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-zinc-800">Generate images</div>
                            <div className="mt-0.5 text-xs text-zinc-500">Adds images to the hosted page when drafting.</div>
                          </div>
                          <ToggleSwitch
                            checked={Boolean(settings?.includeImages)}
                            onChange={(checked) =>
                              setSettings((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      includeImages: checked,
                                      includeImagesWhereNeeded: checked ? Boolean(prev.includeImagesWhereNeeded) : false,
                                    }
                                  : prev,
                              )
                            }
                            ariaLabel="Generate images for hosted newsletter pages"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-zinc-800">Royalty-free images</div>
                            <div className="mt-0.5 text-xs text-zinc-500">Uses Wikimedia Commons results.</div>
                          </div>
                          <ToggleSwitch
                            checked={Boolean(settings?.royaltyFreeImages ?? true)}
                            onChange={(checked) => setSettings((prev) => (prev ? { ...prev, royaltyFreeImages: checked } : prev))}
                            disabled={!Boolean(settings?.includeImages)}
                            ariaLabel="Use royalty-free images"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-zinc-800">Only where needed</div>
                            <div className="mt-0.5 text-xs text-zinc-500">Adds fewer images when content already includes one.</div>
                          </div>
                          <ToggleSwitch
                            checked={Boolean(settings?.includeImagesWhereNeeded)}
                            onChange={(checked) => setSettings((prev) => (prev ? { ...prev, includeImagesWhereNeeded: checked } : prev))}
                            disabled={!Boolean(settings?.includeImages)}
                            ariaLabel="Only generate images where needed"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {aiStep === "guided" ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-zinc-900">Guided prompt</div>
                  <div className="mt-2 text-sm text-zinc-600">Answer a few questions to steer the next draft.</div>
                  <div className="mt-3 grid gap-3">
                    {promptFields.map((f) => (
                      <label key={f.key} className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{f.label}</div>
                        <textarea
                          value={settings?.promptAnswers?.[f.key] ?? ""}
                          onChange={(e) =>
                            setSettings((prev) =>
                              prev
                                ? { ...prev, promptAnswers: { ...prev.promptAnswers, [f.key]: e.target.value.slice(0, 2000) } }
                                : prev,
                            )
                          }
                          rows={3}
                          className="mt-2 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                          placeholder={audience === "internal" ? "Type a few bullets…" : "Type a few sentences…"}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {aiStep === "topics" ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-zinc-900">Topic hints (optional)</div>
                  <div className="mt-2 text-sm text-zinc-600">Add as many as you want. The generator rotates through these over time.</div>

                  <div className="mt-3 space-y-2">
                    {(Array.isArray(settings?.topics) && settings?.topics.length ? settings.topics : [""]).map((t, idx, arr) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={t}
                          onChange={(e) => {
                            const next = [...arr];
                            next[idx] = e.target.value;
                            setSettings((prev) => (prev ? { ...prev, topics: next } : prev));
                          }}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder={
                            audience === "internal"
                              ? idx === 0
                                ? "Weekly priorities"
                                : "Another topic"
                              : idx === 0
                                ? "Seasonal maintenance tips"
                                : "Another topic"
                          }
                        />

                        {arr.length > 1 ? (
                          <button
                            type="button"
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                            onClick={() => {
                              const next = arr.filter((_, i) => i !== idx);
                              setSettings((prev) => (prev ? { ...prev, topics: next } : prev));
                            }}
                            aria-label="Remove topic"
                          >
                            Remove
                          </button>
                        ) : null}

                        {idx === arr.length - 1 ? (
                          <button
                            type="button"
                            className="rounded-2xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
                            onClick={() => {
                              const next = [...arr, ""];
                              setSettings((prev) => (prev ? { ...prev, topics: next } : prev));
                            }}
                            aria-label="Add another topic"
                            title="Add another"
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {aiStep === "review" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Review</div>
                  <div className="mt-1 text-sm text-zinc-600">Confirm the inputs, then generate a draft (30 credits).</div>
                  <pre className="mt-3 whitespace-pre-wrap wrap-break-word rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
                    {reviewSynopsis || "No settings loaded."}
                  </pre>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className={
                        "rounded-2xl px-4 py-2 text-sm font-semibold shadow-sm transition " +
                        (saving || !settings || !isDirty
                          ? "bg-zinc-200 text-zinc-600"
                          : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-90")
                      }
                      disabled={saving || !settings || !isDirty}
                      onClick={saveSettings}
                    >
                      {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
                    </button>
                    <button
                      type="button"
                      disabled={generating || saving || !settings}
                      onClick={async () => {
                        await saveSettings();
                        await generateNow();
                      }}
                      className={
                        "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold " +
                        (generating || saving || !settings
                          ? "bg-zinc-200 text-zinc-600"
                          : "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] text-white shadow-sm hover:opacity-90")
                      }
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                        <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                      </svg>
                      <span>{generating ? "Generating…" : "Generate"}</span>
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={aiStepIndex <= 0}
                  onClick={() => setAiStep(aiStepOrder[Math.max(0, aiStepIndex - 1)])}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={aiStepIndex >= aiStepOrder.length - 1}
                  onClick={() => setAiStep(aiStepOrder[Math.min(aiStepOrder.length - 1, aiStepIndex + 1)])}
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Settings</div>
              <div className="mt-2 text-sm text-zinc-600">Audience, hosted pages, and delivery preferences.</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setTab("newsletters")}
                  className="rounded-2xl px-3 py-2 text-xs font-semibold text-zinc-700 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                >
                  Newsletters
                </button>
                <button
                  type="button"
                  onClick={() => setTab("settings")}
                  className="rounded-2xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5"
                >
                  Settings
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
              <div className="text-sm font-semibold text-zinc-900">Audience</div>
              <div className="mt-2 text-sm text-zinc-600">Choose which tags are included in this send list.</div>

              <div className="mt-3 max-w-sm">
                <input
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="Search tags…"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <div className="mt-2">
                  <PortalListboxDropdown
                    value={addTagValue as any}
                    options={addTagOptions as any}
                    onChange={(v) => {
                      const id = String(v || "");
                      if (!id) {
                        setAddTagValue("");
                        return;
                      }
                      setAddTagValue("");
                      setSettings((prev) => {
                        if (!prev) return prev;
                        const next = new Set(prev.audience.tagIds);
                        next.add(id);
                        return { ...prev, audience: { ...prev.audience, tagIds: Array.from(next).slice(0, 200) } };
                      });
                    }}
                    placeholder="Add tag…"
                  />
                </div>

                {!showCreateTag ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                    onClick={() => {
                      const suggestion = tagSearch.trim().slice(0, 60);
                      if (suggestion && !createTagName.trim()) setCreateTagName(suggestion);
                      setShowCreateTag(true);
                    }}
                  >
                    Create new tag…
                  </button>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(settings?.audience?.tagIds ?? []).length ? (
                  (settings?.audience?.tagIds ?? []).map((id) => {
                    const t = tagById.get(id);
                    if (!t) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                      >
                        <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color || "#a1a1aa" }} />
                        <span>{t.name}</span>
                        <button
                          type="button"
                          className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                          onClick={() =>
                            setSettings((prev) => {
                              if (!prev) return prev;
                              const next = new Set(prev.audience.tagIds);
                              next.delete(id);
                              return { ...prev, audience: { ...prev.audience, tagIds: Array.from(next) } };
                            })
                          }
                          aria-label={`Remove ${t.name}`}
                          title="Remove"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })
                ) : (
                  <div className="text-xs text-zinc-500">No audience tags selected yet.</div>
                )}
              </div>

              {showCreateTag ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-700">Create tag</div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => setShowCreateTag(false)}
                      disabled={createTagBusy}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      className="sm:col-span-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder="Tag name"
                      value={createTagName}
                      onChange={(e) => setCreateTagName(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-2 py-2">
                      {DEFAULT_TAG_COLORS.slice(0, 10).map((c) => {
                        const selected = c === createTagColor;
                        return (
                          <button
                            key={c}
                            type="button"
                            className={
                              "h-7 w-7 rounded-full border " +
                              (selected ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200")
                            }
                            style={{ backgroundColor: c }}
                            onClick={() => setCreateTagColor(c)}
                            title={c}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-500">Pick a default color.</div>
                    <button
                      type="button"
                      className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      disabled={createTagBusy}
                      onClick={() => void createOwnerTag()}
                    >
                      {createTagBusy ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              ) : null}

              {audience === "external" ? (
                <div className="mt-5">
                  <div className="text-sm font-semibold text-zinc-900">Manually add people to this newsletter list</div>
                  <div className="mt-2 text-sm text-zinc-600">Search contacts by name, email, or phone and add them.</div>

                  <input
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    onFocus={() => setContactSearchOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setContactSearchOpen(false), 150);
                    }}
                    className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                    placeholder="Search contacts…"
                  />

                  {contactSearchOpen ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Results</div>
                      <div className="mt-2 space-y-2">
                        {contactSearching ? (
                          <div className="text-sm text-zinc-600">Searching…</div>
                        ) : contactResults.length ? (
                          contactResults.slice(0, 25).map((c) => {
                            const added = selectedContactIds.has(c.id);
                            return (
                              <div key={c.id} className="rounded-2xl border border-zinc-200 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-zinc-900">{c.name || c.email || c.phone || "(contact)"}</div>
                                    <div className="mt-1 text-xs text-zinc-500">
                                      {c.email ? c.email : ""}{c.email && c.phone ? " · " : ""}{c.phone ? c.phone : ""}
                                    </div>
                                    <div className="mt-2">
                                      <ContactTagsEditor
                                        contactId={c.id}
                                        tags={c.tags}
                                        compact
                                        onChange={(next) => {
                                          setContactResults((prev) => prev.map((x) => (x.id === c.id ? { ...x, tags: next } : x)));
                                          setSelectedContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, tags: next } : x)));
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className={
                                      "rounded-2xl px-3 py-2 text-sm font-semibold " +
                                      (added
                                        ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                                        : "bg-brand-ink text-white hover:opacity-95")
                                    }
                                    onClick={() =>
                                      setSettings((prev) => {
                                        if (!prev) return prev;
                                        const ids = new Set(prev.audience.contactIds);
                                        if (added) ids.delete(c.id);
                                        else ids.add(c.id);
                                        return { ...prev, audience: { ...prev.audience, contactIds: Array.from(ids).slice(0, 200) } };
                                      })
                                    }
                                  >
                                    {added ? "Remove" : "Add"}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-zinc-600">Type at least 2 characters to search.</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Selected people</div>
                    <div className="mt-2 space-y-2">
                      {selectedContacts.length ? (
                        selectedContacts.slice(0, 50).map((c) => (
                          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-900">{c.name || c.email || c.phone || c.id}</div>
                              <div className="mt-0.5 truncate text-xs text-zinc-500">
                                {c.email ? c.email : ""}{c.email && c.phone ? " · " : ""}{c.phone ? c.phone : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                              onClick={() =>
                                setSettings((prev) => {
                                  if (!prev) return prev;
                                  const ids = prev.audience.contactIds.filter((id) => id !== c.id);
                                  return { ...prev, audience: { ...prev.audience, contactIds: ids } };
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-zinc-600">No manual people selected.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {audience === "internal" ? (
                <div className="mt-5 space-y-4">
                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-800">Send to all users under this account</div>
                      <div className="mt-1 text-xs text-zinc-500">Includes all team members. Use extra emails for additional recipients.</div>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(settings?.audience?.sendAllUsers)}
                      onChange={(checked) =>
                        setSettings((prev) =>
                          prev ? { ...prev, audience: { ...prev.audience, sendAllUsers: checked } } : prev,
                        )
                      }
                      ariaLabel="Send internal newsletter to all team members"
                    />
                  </label>

                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Extra emails (internal only)</div>
                    <div className="mt-2 text-sm text-zinc-600">Add one at a time, or upload a CSV.</div>

                    <div className="mt-3 flex gap-2">
                      <input
                        value={internalEmailInput}
                        onChange={(e) => setInternalEmailInput(e.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="name@company.com"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          const next = internalEmailInput.trim();
                          if (!isEmail(next)) {
                            toast.error("Enter a valid email");
                            return;
                          }
                          setSettings((prev) => {
                            if (!prev) return prev;
                            const nextSet = new Set(prev.audience.emails.map((x) => x.toLowerCase()));
                            const normalized = next.toLowerCase();
                            const emails = [...prev.audience.emails];
                            if (!nextSet.has(normalized)) emails.push(next);
                            return { ...prev, audience: { ...prev.audience, emails: emails.slice(0, 200) } };
                          });
                          setInternalEmailInput("");
                        }}
                      />
                      <button
                        type="button"
                        className="rounded-2xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                        onClick={() => {
                          const next = internalEmailInput.trim();
                          if (!isEmail(next)) {
                            toast.error("Enter a valid email");
                            return;
                          }
                          setSettings((prev) => {
                            if (!prev) return prev;
                            const nextSet = new Set(prev.audience.emails.map((x) => x.toLowerCase()));
                            const normalized = next.toLowerCase();
                            const emails = [...prev.audience.emails];
                            if (!nextSet.has(normalized)) emails.push(next);
                            return { ...prev, audience: { ...prev.audience, emails: emails.slice(0, 200) } };
                          });
                          setInternalEmailInput("");
                        }}
                      >
                        +
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(settings?.audience?.emails ?? []).length ? (
                        (settings?.audience?.emails ?? []).map((e) => (
                          <button
                            key={e}
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            title="Remove"
                            onClick={() =>
                              setSettings((prev) => {
                                if (!prev) return prev;
                                return { ...prev, audience: { ...prev.audience, emails: prev.audience.emails.filter((x) => x !== e) } };
                              })
                            }
                          >
                            {e}
                            <span className="text-zinc-400">×</span>
                          </button>
                        ))
                      ) : (
                        <div className="text-sm text-zinc-600">No extra emails added.</div>
                      )}
                    </div>

                    <div className="mt-3">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                        Upload CSV
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const text = await file.text();
                              const parsed = splitEmails(text).filter(isEmail);
                              if (!parsed.length) {
                                toast.error("No valid emails found in CSV");
                                return;
                              }
                              setSettings((prev) => {
                                if (!prev) return prev;
                                const next = new Map<string, string>();
                                for (const x of prev.audience.emails) next.set(x.toLowerCase(), x);
                                for (const x of parsed) next.set(x.toLowerCase(), x);
                                return { ...prev, audience: { ...prev.audience, emails: Array.from(next.values()).slice(0, 200) } };
                              });
                              toast.success(`Added ${parsed.length} emails`);
                            } finally {
                              if (e.target) e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Usage (30d)</div>
                <div className="mt-2 text-sm text-zinc-800">
                  {creditsUsed30d === null ? "N/A" : `${creditsUsed30d} credits used`} · {generations30d === null ? "N/A" : `${generations30d} generations`}
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hosted pages</div>
                {siteHandle ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 break-all">
                      <span className="font-semibold text-zinc-600">Preview:</span> {publicBaseUrl}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={async () => {
                          if (!publicBaseUrl) return;
                          try {
                            await navigator.clipboard.writeText(publicBaseUrl);
                            toast.success("Copied");
                          } catch {
                            toast.error("Copy failed");
                          }
                        }}
                      >
                        Copy preview
                      </button>
                      <Link
                        href={publicBasePath || "#"}
                        target="_blank"
                        className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
                      >
                        Preview
                      </Link>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 break-all">
                      <span className="font-semibold text-zinc-600">Live:</span> {livePublicBaseUrl}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={async () => {
                          if (!livePublicBaseUrl) return;
                          try {
                            await navigator.clipboard.writeText(livePublicBaseUrl);
                            toast.success("Copied");
                          } catch {
                            toast.error("Copy failed");
                          }
                        }}
                      >
                        Copy live
                      </button>
                      <a
                        href={livePublicBaseUrl || "#"}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={
                          "rounded-xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-xs font-semibold text-white hover:opacity-95 " +
                          (!livePublicBaseUrl ? "pointer-events-none opacity-60" : "")
                        }
                      >
                        Live
                      </a>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => {
                          const name = (site?.name || "Newsletter site").trim();
                          const slug = (site?.slug || "").trim();
                          const primaryDomain = (site?.primaryDomain || "").trim();
                          setSiteConfigName(name);
                          setSiteConfigSlug(slug);
                          setSiteConfigDomain(primaryDomain);
                          lastSavedSiteConfigSigRef.current = JSON.stringify({ name, slug, primaryDomain });
                          setSiteConfigOpen(true);
                        }}
                      >
                        Edit hosted pages
                      </button>
                    </div>

                    {normalizedPrimaryDomain && primaryDomainStatus !== "VERIFIED" ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Custom domain saved: <span className="font-semibold">{normalizedPrimaryDomain}</span>
                        {primaryDomainStatus ? ` (${primaryDomainStatus.toLowerCase()})` : ""}
                      </div>
                    ) : null}

                    {/* Live falls back to Preview until a custom domain is VERIFIED. */}
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="text-sm text-zinc-700">Set up hosted pages so every newsletter has a shareable link.</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                        onClick={() => {
                          const name = (site?.name || "Newsletter site").trim();
                          const slug = (site?.slug || "").trim();
                          const primaryDomain = (site?.primaryDomain || "").trim();
                          setSiteConfigName(name);
                          setSiteConfigSlug(slug);
                          setSiteConfigDomain(primaryDomain);
                          lastSavedSiteConfigSigRef.current = JSON.stringify({ name, slug, primaryDomain });
                          setSiteConfigOpen(true);
                        }}
                      >
                        Set up hosted pages
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {draftOpen ? (
        <div
          className="fixed inset-0 z-9997 flex items-stretch justify-center bg-black/30 px-0 pt-[var(--pa-modal-safe-top,0px)] pb-0 sm:px-4 sm:pt-[calc(var(--pa-modal-safe-top,0px)+1rem)]"
          onMouseDown={() => setDraftOpen(false)}
        >
          <div
            className="w-full h-[calc(100dvh-var(--pa-modal-safe-top,0px))] overflow-y-auto bg-white p-4 shadow-xl sm:my-4 sm:max-w-5xl sm:max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-2rem)] sm:rounded-3xl sm:border sm:border-zinc-200"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{draftStatus === "SENT" ? "Hosted page editor" : "Draft editor"}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {draftStatus === "SENT"
                    ? "Edits update the hosted page only. Email/SMS were already sent."
                    : "Edit what will be sent and preview email/SMS."}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close draft editor"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:bg-zinc-50 hover:text-zinc-800"
                onClick={() => setDraftOpen(false)}
                disabled={draftSaving}
              >
                ×
              </button>
            </div>

            {draftLoading ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">Loading…</div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Draft fields</div>

                  {draftError ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{draftError}</div>
                  ) : null}

                  {draftStatus === "SENT" ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This newsletter was already sent. Saving will only change the hosted page version.
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">Title</label>
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      maxLength={180}
                    />
                  </div>

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">Excerpt</label>
                    <textarea
                      value={draftExcerpt}
                      onChange={(e) => setDraftExcerpt(e.target.value)}
                      className="mt-1 min-h-22.5 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      maxLength={6000}
                    />
                    <div className="mt-1 text-xs text-zinc-500">This is what the email contains today (plus the hosted link).</div>
                  </div>

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">SMS text</label>
                    <input
                      value={draftSmsText}
                      onChange={(e) => setDraftSmsText(e.target.value)}
                      disabled={draftStatus === "SENT"}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      placeholder="New newsletter is ready."
                      maxLength={240}
                    />
                    <div className="mt-1 text-xs text-zinc-500">
                      {draftStatus === "SENT" ? "Locked after sending." : "A hosted link is appended automatically."}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-xs font-semibold text-zinc-600">Hosted page content (Markdown)</label>
                    <div className="mt-1">
                      <RichTextMarkdownEditor markdown={draftContent} onChange={setDraftContent} placeholder="Write the hosted content…" disabled={draftSaving} />
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-700">Files & photos</div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-zinc-600">Alt text (optional)</label>
                        <input
                          value={assetAlt}
                          onChange={(e) => setAssetAlt(e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                          placeholder="Team photo, receipt, etc."
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-600">Selected file</div>
                          {assetUrl ? (
                            <button
                              type="button"
                              className="text-xs font-semibold text-zinc-600 hover:underline"
                              onClick={() => {
                                setAssetUrl(null);
                                setAssetFileName("");
                              }}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 break-all">
                          {assetUrl ? assetFileName || assetUrl : "No file selected yet."}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                        {assetBusy ? "Uploading…" : "Upload"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={assetBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setAssetBusy(true);
                            try {
                              const fd = new FormData();
                              fd.set("file", file);
                              const up = await fetch("/api/uploads", { method: "POST", body: fd });
                              const upBody = (await up.json().catch(() => ({}))) as any;
                              if (!up.ok || !upBody.url) {
                                toast.error(String(upBody.error || "Upload failed"));
                                return;
                              }
                              setAssetUrl(String(upBody.url));
                              setAssetFileName(String(upBody.fileName || file.name || ""));
                            } finally {
                              setAssetBusy(false);
                              if (e.target) e.target.value = "";
                            }
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={() => setAssetPickerOpen(true)}
                      >
                        Choose from media library
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!assetUrl}
                        className="rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
                        onClick={() => {
                          if (!assetUrl) return;
                          const alt = assetAlt.trim() || "image";
                          insertIntoDraftContent(`![${alt}](${assetUrl})`);
                        }}
                      >
                        Insert image
                      </button>
                      <button
                        type="button"
                        disabled={!assetUrl}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        onClick={() => {
                          if (!assetUrl) return;
                          const label = (assetFileName || assetAlt || "file").trim() || "file";
                          insertIntoDraftContent(`[${label}](${assetUrl})`);
                        }}
                      >
                        Insert link
                      </button>
                    </div>

                    <PortalMediaPickerModal
                      open={assetPickerOpen}
                      title="Choose a file"
                      confirmLabel="Use"
                      onClose={() => setAssetPickerOpen(false)}
                      onPick={(item) => {
                        setAssetUrl(item.shareUrl);
                        setAssetFileName(String(item.fileName || ""));
                        setAssetPickerOpen(false);
                      }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    {siteHandle && draftSlug ? (
                      customHostedBaseUrl ? (
                        <a
                          href={`${customHostedBaseUrl}${audience === "internal" ? "/internal-newsletters" : "/newsletters"}/${draftSlug}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Open hosted
                        </a>
                      ) : (
                        <Link
                          href={`${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`}
                          target="_blank"
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Open hosted
                        </Link>
                      )
                    ) : null}
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => {
                        setDraftOpen(false);
                      }}
                      disabled={draftSaving}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => void saveDraft()}
                      disabled={draftSaving || !draftTitle.trim()}
                    >
                      {draftSaving ? "Saving…" : draftStatus === "SENT" ? "Save hosted page" : "Save draft"}
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preview</div>

                  {siteHandle && draftSlug ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-xs font-semibold text-zinc-700">Hosted link</div>
                      <div className="mt-1 text-xs text-zinc-700 break-all">
                        {customHostedBaseUrl
                          ? `${customHostedBaseUrl}${audience === "internal" ? "/internal-newsletters" : "/newsletters"}/${draftSlug}`
                          : typeof window === "undefined"
                            ? `${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`
                            : toPurelyHostedUrl(`${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`)}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <div className="text-sm font-semibold text-zinc-900">Email preview</div>
                    <div className="mt-2 text-xs text-zinc-500">Subject uses the title. Body uses excerpt + hosted link.</div>

                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold text-zinc-700">Subject</div>
                      <div className="mt-1 text-sm text-zinc-900">{draftTitle || "(untitled)"}</div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold text-zinc-700">Body</div>
                      <pre className="mt-2 whitespace-pre-wrap wrap-break-word text-xs text-zinc-800">
                        {buildNewsletterEmailPreview({
                          excerpt: draftExcerpt,
                          link:
                            typeof window === "undefined" || !siteHandle || !draftSlug
                              ? "(hosted link)"
                              : customHostedBaseUrl
                                ? `${customHostedBaseUrl}${audience === "internal" ? "/internal-newsletters" : "/newsletters"}/${draftSlug}`
                                : toPurelyHostedUrl(`${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`),
                        })}
                      </pre>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-sm font-semibold text-zinc-900">SMS preview</div>
                    <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-3">
                      <pre className="whitespace-pre-wrap wrap-break-word text-xs text-zinc-800">
                        {buildNewsletterSmsPreview({
                          smsText: draftSmsText || null,
                          link:
                            typeof window === "undefined" || !siteHandle || !draftSlug
                              ? "(hosted link)"
                              : customHostedBaseUrl
                                ? `${customHostedBaseUrl}${audience === "internal" ? "/internal-newsletters" : "/newsletters"}/${draftSlug}`
                                : toPurelyHostedUrl(`${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${draftSlug}`),
                        })}
                      </pre>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</div>
                    <div className="mt-2 text-sm text-zinc-800">{draftStatus}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {draftStatus === "SENT"
                        ? "SENT newsletters can be edited for the hosted page only."
                        : "READY drafts are safe to edit before sending."}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {siteConfigOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
          onMouseDown={() => {
            if (siteConfigBusy) return;
            setSiteConfigOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Set up hosted pages</div>
                <div className="mt-1 text-sm text-zinc-600">Create a shareable link where your newsletters live.</div>
              </div>
              <button
                type="button"
                aria-label="Close hosted pages setup"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-60"
                onClick={() => setSiteConfigOpen(false)}
                disabled={siteConfigBusy}
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Site name</div>
                <input
                  value={siteConfigName}
                  onChange={(e) => setSiteConfigName(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                  placeholder="Acme Newsletters"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Public link (slug)</div>
                <input
                  value={siteConfigSlug}
                  onChange={(e) => setSiteConfigSlug(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                  placeholder="acme"
                />
                <div className="mt-1 text-xs text-zinc-500">This becomes part of the URL. Leave blank to auto-generate.</div>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Custom domain (optional)</div>
                <div className="mt-1">
                  <PortalListboxDropdown
                    value={siteConfigDomain as any}
                    disabled={siteConfigBusy || funnelDomainsBusy || !funnelDomains}
                    options={
                      [
                        { value: "", label: "No custom domain" },
                        ...((funnelDomains || []).map((d) => ({
                          value: d.domain,
                          label: d.domain,
                          hint: d.status === "PENDING" ? "Pending DNS verification" : undefined,
                        })) as any[]),
                      ] as any
                    }
                    onChange={(v) => setSiteConfigDomain(String(v || ""))}
                    placeholder={funnelDomainsBusy ? "Loading domains…" : (funnelDomains || []).length ? "Choose a domain" : "No domains yet"}
                  />
                </div>
                <div className="mt-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="text-xs text-zinc-500">Domains come from Funnel Builder → Settings → Custom domains.</div>
                  <Link
                    href="/portal/app/services/funnel-builder/settings"
                    className="text-xs font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                  >
                    Add / manage domains
                  </Link>
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => setSiteConfigOpen(false)}
                disabled={siteConfigBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                disabled={siteConfigBusy || siteConfigName.trim().length < 2 || !siteConfigDirty}
                onClick={async () => {
                  const name = siteConfigName.trim().slice(0, 120);
                  const slug = siteConfigSlug.trim().slice(0, 80);
                  const primaryDomain = siteConfigDomain.trim().slice(0, 253);
                  if (name.length < 2) return;

                  setSiteConfigBusy(true);
                  try {
                    const res = await fetch("/api/portal/newsletter/site", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ name, slug, primaryDomain }),
                    });
                    const json = (await res.json().catch(() => ({}))) as any;
                    if (!res.ok || !json?.ok || !json?.site) {
                      toast.error(String(json?.error || "Failed to save hosted pages"));
                      return;
                    }
                    setSite(json.site as Site);

                    const nextName = String(json.site?.name || name).trim();
                    const nextSlug = String(json.site?.slug || slug).trim();
                    const nextPrimaryDomain = String(json.site?.primaryDomain || primaryDomain).trim();

                    setSiteConfigName(nextName);
                    setSiteConfigSlug(nextSlug);
                    setSiteConfigDomain(nextPrimaryDomain);
                    lastSavedSiteConfigSigRef.current = JSON.stringify({
                      name: nextName,
                      slug: nextSlug,
                      primaryDomain: nextPrimaryDomain,
                    });
                    toast.success("Hosted pages configured");
                    await refresh();
                  } finally {
                    setSiteConfigBusy(false);
                  }
                }}
              >
                {siteConfigBusy ? "Saving…" : siteConfigDirty ? "Save" : "Saved"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPaMobileApp && tab === "newsletters" && !composerOpen && !draftOpen ? (
        <button
          type="button"
          className="fixed right-4 z-11001 rounded-full bg-[#007aff] px-5 py-3 text-sm font-semibold text-white shadow-xl hover:bg-[#006ae6]"
          style={{
            bottom:
              "calc(var(--pa-portal-embed-footer-offset,0px) + 5.75rem + var(--pa-portal-floating-tools-reserve, 0px))",
          }}
          onClick={() => {
            setComposerOpen(true);
            setMode("ai");
            setAiStep("delivery");
          }}
        >
          + New newsletter
        </button>
      ) : null}
    </div>
  );
}
