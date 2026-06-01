"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { IconBusinessGlyph, IconFunnel, IconPeopleGlyph, IconPhoneCall, IconSend, IconSendHover, IconServiceGlyph } from "@/app/portal/PortalIcons";
import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  IconSidebarSettings,
  PortalSidebarNavButton,
  portalSidebarBorderButtonActiveClass,
  portalSidebarBorderButtonBaseClass,
  portalSidebarBorderButtonInactiveClass,
  portalSidebarIconToneClassForSlug,
  portalSidebarIconToneNeutralClass,
  portalSidebarIconTonePinkClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { type ContactTag } from "@/components/ContactTagsEditor";
import { PortalMultiSelectDropdown, type PortalMultiSelectOption } from "@/components/PortalMultiSelectDropdown";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { AppModal } from "@/components/AppModal";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { useToast } from "@/components/ToastProvider";
import { portalGlassButtonClass, portalGlassPanelClass, portalGlassSectionClass } from "@/components/portalGlass";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";
import { LEAD_OUTBOUND_VARIABLES, type TemplateVariable } from "@/lib/portalTemplateVars";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import { getReadableTagPillStyle } from "@/lib/tagColors.shared";
import LeadLocationsMap from "./LeadLocationsMap";

const classNames = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

const PENDING_MAP_LEAD_STORAGE_KEY = "pa.lead-scraping.pending-map-lead-id";
const LEAD_SCRAPING_VIEW_CACHE_KEY = "pa.lead-scraping.view-cache.v1";

const TAG_COLORS = [
  "#0EA5E9", // sky
  "#2563EB", // blue
  "#7C3AED", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#F59E0B", // amber
  "#10B981", // emerald
  "#22C55E", // green
  "#64748B", // slate
  "#111827", // gray-900
] as const;

const leadActionBlueSoftClass =
  "pa-lead-scraping-action inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[rgba(29,78,216,0.12)] px-5 py-3 text-sm font-semibold text-brand-blue shadow-[0_8px_18px_rgba(29,78,216,0.09)] transition-all duration-150 enabled:hover:bg-[rgba(29,78,216,0.18)] disabled:cursor-default disabled:opacity-60 disabled:shadow-none";

const leadActionGreenSoftClass =
  "inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 shadow-[0_8px_18px_rgba(16,185,129,0.08)] transition-all duration-150 enabled:hover:bg-emerald-100 disabled:cursor-default disabled:opacity-60 disabled:shadow-none";

const leadActionVioletSoftClass =
  "inline-flex items-center justify-center gap-2.5 rounded-2xl bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 shadow-[0_8px_18px_rgba(124,58,237,0.08)] transition-all duration-150 enabled:hover:bg-violet-100 disabled:cursor-default disabled:opacity-60 disabled:shadow-none";

const leadActionAmberSoftClass =
  "inline-flex items-center justify-center gap-2.5 rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-700 shadow-[0_8px_18px_rgba(245,158,11,0.1)] transition-all duration-150 enabled:hover:bg-amber-100 disabled:cursor-default disabled:opacity-60 disabled:shadow-none";

const leadActionRoseSoftClass =
  "inline-flex items-center justify-center gap-2.5 rounded-2xl bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 shadow-[0_8px_18px_rgba(244,63,94,0.08)] transition-all duration-150 enabled:hover:bg-rose-100 disabled:cursor-default disabled:opacity-60 disabled:shadow-none";

const leadActionExportClass =
  "pa-lead-scraping-action inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-(--color-brand-blue) shadow-[0_8px_18px_rgba(29,78,216,0.09)] transition-all duration-150 enabled:hover:bg-[rgba(29,78,216,0.18)] disabled:cursor-default disabled:opacity-60 disabled:shadow-none";

const leadActionExportCompactClass =
  "pa-lead-scraping-action inline-flex items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.12)] px-3 py-1.5 text-xs font-semibold text-brand-blue shadow-[0_8px_18px_rgba(29,78,216,0.09)] transition-all duration-150 enabled:hover:bg-[rgba(29,78,216,0.18)] disabled:cursor-default disabled:opacity-60 disabled:shadow-none";

const leadComposeSendButtonClass =
  "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white transition-opacity duration-100 hover:opacity-95 disabled:cursor-default disabled:opacity-60";

const leadActionIconWrapClass = "inline-flex shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4";

const leadPaneScrollClass = "pa-portal-scroll overflow-y-auto overscroll-y-contain overflow-x-hidden";

function LeadActionServiceIcon({ slug }: { slug: string }) {
  return (
    <span className={leadActionIconWrapClass}>
      <IconServiceGlyph slug={slug} />
    </span>
  );
}

const SCRAPER_NICHE_SUGGESTIONS = [
  "Roofing",
  "Med Spa",
  "Dentist",
  "Chiropractor",
  "HVAC",
  "Plumber",
  "Real estate agent",
  "Home builder",
  "Attorney",
  "Insurance agency",
  "Auto repair",
  "Landscaper",
] as const;

type LocationSuggestionRow = {
  value: string;
  label: string;
  hint?: string;
};

function normalizeUniqueSelections(values: Array<string | null | undefined>, max = 20) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = String(value || "").trim();
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
}

function getB2bNicheSelections(b2b?: LeadScrapingSettings["b2b"] | null) {
  return normalizeUniqueSelections([b2b?.niche, ...(b2b?.nicheSelections ?? []), ...(b2b?.fallbackNiches ?? [])]);
}

function getB2bLocationSelections(b2b?: LeadScrapingSettings["b2b"] | null) {
  return normalizeUniqueSelections([b2b?.location, ...(b2b?.locationSelections ?? []), ...(b2b?.fallbackLocations ?? [])]);
}

function syncB2bSelections(
  b2b: LeadScrapingSettings["b2b"],
  next: { niches?: string[]; locations?: string[]; requireAddress?: boolean },
): LeadScrapingSettings["b2b"] {
  const niches = next.niches ? normalizeUniqueSelections(next.niches) : getB2bNicheSelections(b2b);
  const locations = next.locations ? normalizeUniqueSelections(next.locations) : getB2bLocationSelections(b2b);
  return {
    ...b2b,
    niche: niches[0] ?? "",
    nicheSelections: niches,
    fallbackNiches: niches.slice(1),
    location: locations[0] ?? "",
    locationSelections: locations,
    fallbackLocations: locations.slice(1),
    fallbackEnabled: false,
    requireAddress: next.requireAddress ?? b2b.requireAddress ?? true,
  };
}

function normalizeLeadScrapingSettingsForSave(settings: LeadScrapingSettings): LeadScrapingSettings {
  return {
    ...settings,
    b2b: syncB2bSelections(settings.b2b, {}),
  };
}

const leadScrapingFullBleedShellClass =
  "h-full min-h-0 overflow-hidden overscroll-none";

const leadScrapingEdgeFrameClass =
  "h-full min-h-0 overflow-hidden border-y border-zinc-200 bg-white";

function getB2bSubTabFromPathname(
  pathname: string | null | undefined,
  fallback: "pull" | "leads" | "settings",
): "pull" | "leads" | "settings" {
  const normalized = String(pathname || "").toLowerCase();
  if (normalized.includes("/app/services/lead-scraping/settings")) return "settings";
  if (normalized.includes("/app/services/lead-scraping/scraper")) return "pull";
  if (normalized.includes("/app/services/lead-scraping")) return "leads";
  return fallback;
}

function getLeadScrapingLoadErrorMessage(mode: "pull" | "leads" | "settings") {
  if (mode === "pull") return "Lead scraper is still syncing. Retry here, open settings, or ask Pura to help.";
  if (mode === "leads") return "Leads are still syncing. Retry here, open settings, or ask Pura to help.";
  return "Lead scraping is still syncing. Retry here, open settings, or ask Pura to help.";
}

function LeadScrapingShellBlock({ className }: { className?: string }) {
  return <div className={classNames("animate-pulse rounded-[1.35rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(226,232,240,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", className)} />;
}

function LeadScrapingLoadingShell({
  mode,
  message,
}: {
  mode: "pull" | "leads" | "settings";
  message?: string | null;
}) {
  const notice = message ? <div className="px-4 py-3 text-sm font-medium text-zinc-600 sm:px-6">{message}</div> : null;

  if (mode === "pull") {
    return (
      <div className={leadScrapingFullBleedShellClass}>
        <div className={leadScrapingEdgeFrameClass}>
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="min-h-0 overflow-y-auto border-b border-zinc-200 lg:border-b-0 lg:border-r">
              {notice}
              <div className="px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <LeadScrapingShellBlock className="h-6 w-32" />
                    <LeadScrapingShellBlock className="mt-2 h-4 w-72 max-w-full" />
                  </div>
                  <div>
                    <LeadScrapingShellBlock className="h-4 w-36" />
                    <LeadScrapingShellBlock className="mt-2 h-5 w-20" />
                  </div>
                </div>
                <div className="mt-6 max-w-3xl space-y-4">
                  <LeadScrapingShellBlock className="h-20 w-full" />
                  <LeadScrapingShellBlock className="h-24 w-full" />
                  <LeadScrapingShellBlock className="h-14 w-40" />
                  <LeadScrapingShellBlock className="h-64 w-full" />
                  <div className="flex gap-3">
                    <LeadScrapingShellBlock className="h-12 w-28" />
                    <LeadScrapingShellBlock className="h-12 w-28" />
                    <LeadScrapingShellBlock className="h-12 w-28" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="border-b border-zinc-200 px-4 py-4 sm:px-6">
                <LeadScrapingShellBlock className="h-6 w-40" />
                <LeadScrapingShellBlock className="mt-2 h-4 w-52" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <LeadScrapingShellBlock key={index} className="h-32 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "leads") {
    return (
      <div className={leadScrapingFullBleedShellClass}>
        <div className={leadScrapingEdgeFrameClass}>
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-2">
            <div className="flex min-h-0 flex-col overflow-hidden border-b border-zinc-200 lg:border-b-0 lg:border-r">
              {notice}
              <div className="border-b border-zinc-200 px-4 py-4 sm:px-6">
                <LeadScrapingShellBlock className="h-6 w-24" />
                <LeadScrapingShellBlock className="mt-2 h-4 w-56" />
                <LeadScrapingShellBlock className="mt-4 h-11 w-full" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <LeadScrapingShellBlock key={index} className="h-28 w-full" />
                  ))}
                </div>
              </div>
            </div>
            <div className="min-h-0 h-full overflow-hidden bg-[linear-gradient(180deg,rgba(248,250,252,0.88),rgba(241,245,249,0.82))]">
              <div className="h-full w-full animate-pulse bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.06),transparent_26%),radial-gradient(circle_at_75%_35%,rgba(99,102,241,0.05),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.86),rgba(241,245,249,0.72))]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div />
        <div className="w-full sm:w-auto">
          <LeadScrapingShellBlock className="h-11 w-40" />
        </div>
      </div>
      <div className="mt-4 space-y-6">
        {message ? <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-600">{message}</div> : null}
        <LeadScrapingShellBlock className="h-44 w-full" />
        <LeadScrapingShellBlock className="h-104 w-full" />
        <div className="flex flex-col gap-3 sm:flex-row">
          <LeadScrapingShellBlock className="h-12 w-32" />
          <LeadScrapingShellBlock className="h-12 w-24" />
        </div>
      </div>
    </div>
  );
}

type LeadRow = {
  id: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  starred: boolean;
  tag?: string | null;
  tagColor?: string | null;
  contactId?: string | null;
  assignedToUserId?: string | null;
  assignedToUserIds?: string[];
  contactTags?: ContactTag[];
  synopsis?: string | null;
  contactPerson?: string | null;
  alternateEmails?: string[];
  secondaryPhones?: string[];
  businessFacts?: string[];
  isChain?: boolean | null;
  createdAtIso: string;
};

type LeadAssigneeRow = {
  userId: string;
  role: string;
  user: { id: string; email: string; name: string; active: boolean };
  implicit?: boolean;
};

type NurtureCampaignPickerRow = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | string;
  stepsCount: number;
  enrollments?: {
    active?: number;
    completed?: number;
    stopped?: number;
  };
};

type OutboundResource = { label: string; url: string };

type ExclusionKind = "name" | "domain" | "phone" | "address";

type ExclusionDraftState = Record<ExclusionKind, string[]>;

function dedupeOutboundResources(resources: OutboundResource[]) {
  const next: OutboundResource[] = [];
  const seen = new Set<string>();

  for (const resource of resources) {
    const label = String(resource?.label || "").trim().slice(0, 120) || "Resource";
    const url = String(resource?.url || "").trim().slice(0, 500);
    if (!url) continue;
    const key = `${url}::${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ label, url });
    if (next.length >= 30) break;
  }

  return next;
}

function mergeLegacyOutboundResources(emailResources: OutboundResource[], smsResources: OutboundResource[]) {
  return dedupeOutboundResources([...emailResources, ...smsResources]).slice(0, 30);
}

function getOutboundResourcesForChannel(
  outbound: LeadScrapingSettings["outbound"],
  channel: "email" | "sms",
) {
  const explicit = channel === "email" ? outbound.emailResources : outbound.smsResources;
  if (Array.isArray(explicit)) return dedupeOutboundResources(explicit);
  return dedupeOutboundResources(outbound.resources ?? []);
}

function updateOutboundResourcesForChannel(
  outbound: LeadScrapingSettings["outbound"],
  channel: "email" | "sms",
  nextResources: OutboundResource[],
): LeadScrapingSettings["outbound"] {
  const emailResources =
    channel === "email"
      ? dedupeOutboundResources(nextResources)
      : getOutboundResourcesForChannel(outbound, "email");
  const smsResources =
    channel === "sms"
      ? dedupeOutboundResources(nextResources)
      : getOutboundResourcesForChannel(outbound, "sms");

  return {
    ...outbound,
    emailResources,
    smsResources,
    resources: mergeLegacyOutboundResources(emailResources, smsResources),
  };
}

function createEmptyExclusionDraftState(): ExclusionDraftState {
  return {
    name: [],
    domain: [],
    phone: [],
    address: [],
  };
}

function normalizeStringArray(values: unknown, max = 200) {
  if (!Array.isArray(values)) return [] as string[];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
    if (next.length >= max) break;
  }
  return next;
}

function normalizeLeadScrapingSettingsShape(settings: LeadScrapingSettings | null | undefined): LeadScrapingSettings | null {
  if (!settings) return null;

  const legacyResources = dedupeOutboundResources(Array.isArray(settings.outbound?.resources) ? settings.outbound.resources : []);
  const emailResources = dedupeOutboundResources(
    Array.isArray(settings.outbound?.emailResources) ? settings.outbound.emailResources : legacyResources,
  );
  const smsResources = dedupeOutboundResources(
    Array.isArray(settings.outbound?.smsResources) ? settings.outbound.smsResources : legacyResources,
  );

  return {
    ...settings,
    b2b: {
      ...settings.b2b,
      nicheSelections: normalizeStringArray(settings.b2b.nicheSelections, 20),
      locationSelections: normalizeStringArray(settings.b2b.locationSelections, 20),
      latestRunLeadIds: normalizeStringArray(settings.b2b.latestRunLeadIds, 500),
      fallbackLocations: normalizeStringArray(settings.b2b.fallbackLocations, 20),
      fallbackNiches: normalizeStringArray(settings.b2b.fallbackNiches, 20),
      excludeNameContains: normalizeStringArray(settings.b2b.excludeNameContains, 200),
      excludeDomains: normalizeStringArray(settings.b2b.excludeDomains, 200),
      excludePhones: normalizeStringArray(settings.b2b.excludePhones, 200),
      excludeAddresses: normalizeStringArray(settings.b2b.excludeAddresses, 200),
    },
    outbound: {
      ...settings.outbound,
      emailResources,
      smsResources,
      resources: mergeLegacyOutboundResources(emailResources, smsResources),
    },
  };
}

function buildExclusionDraftState(settings: LeadScrapingSettings | null): ExclusionDraftState {
  return {
    name: settings?.b2b.excludeNameContains ?? [],
    domain: settings?.b2b.excludeDomains ?? [],
    phone: settings?.b2b.excludePhones ?? [],
    address: settings?.b2b.excludeAddresses ?? [],
  };
}

type LeadScrapingSettings = {
  version: 3;
  tagPresets?: Array<{ label: string; color: string }>;
  b2b: {
    tagPresets?: Array<{ label: string; color: string }>;
    niche: string;
    nicheSelections?: string[];
    location: string;
    locationSelections?: string[];
    latestRunLeadIds?: string[];
    fallbackEnabled?: boolean;
    fallbackLocations?: string[];
    fallbackNiches?: string[];
    count: number;
    requireAddress?: boolean;
    aiVerifyBusinesses?: boolean;
    requireEmail: boolean;
    requirePhone: boolean;
    requireWebsite: boolean;
    excludeNameContains: string[];
    excludeDomains: string[];
    excludePhones: string[];
    excludeAddresses: string[];
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  b2c: {
    source?: "OSM_ADDRESS" | "OSM_POI_PHONE";
    location?: string;
    country?: string;
    count?: number;
    tagPresets?: Array<{ label: string; color: string }>;
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  outbound: {
    enabled: boolean;
    aiDraftAndSend?: boolean;
    aiCampaignId?: string | null;
    aiPrompt?: string;
    email: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      subject: string;
      text: string;
    };
    sms: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      text: string;
    };
    calls?: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
    };
    emailResources?: OutboundResource[];
    smsResources?: OutboundResource[];
    resources: OutboundResource[];
  };
  outboundState: {
    approvedAtByLeadId: Record<string, string>;
    sentAtByLeadId: Record<string, string>;
  };
};


type LeadScrapingViewCache = {
  settings: LeadScrapingSettings | null;
  credits: number | null;
  placesConfigured: boolean;
  aiCallsUnlocked: boolean;
  aiCampaignsLite: Array<{ id: string; name: string; status: string }> | null;
  leads: LeadRow[];
  latestRunLeads: LeadRow[];
  leadTotalCount: number | null;
  leadMatchedCount: number | null;
  cachedAt: number;
};

function normalizeAiCampaignLiteRows(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : {}))
    .map((row) => ({
      id: String(row.id || "").trim(),
      name: String(row.name || "").trim(),
      status: String(row.status || "").trim(),
    }))
    .filter((row) => row.id && row.name)
    .slice(0, 200);
}

function readLeadScrapingViewCache(): LeadScrapingViewCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LEAD_SCRAPING_VIEW_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LeadScrapingViewCache> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const aiCallsUnlocked = Boolean(parsed.aiCallsUnlocked);
    const aiCampaignsLite = normalizeAiCampaignLiteRows(parsed.aiCampaignsLite);
    return {
      settings: normalizeLeadScrapingSettingsShape((parsed.settings as LeadScrapingSettings | null | undefined) ?? null),
      credits: typeof parsed.credits === "number" ? parsed.credits : null,
      placesConfigured: Boolean(parsed.placesConfigured),
      aiCallsUnlocked,
      aiCampaignsLite: aiCallsUnlocked && aiCampaignsLite.length === 0 ? null : aiCampaignsLite,
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      latestRunLeads: Array.isArray(parsed.latestRunLeads) ? parsed.latestRunLeads : [],
      leadTotalCount: typeof parsed.leadTotalCount === "number" ? parsed.leadTotalCount : null,
      leadMatchedCount: typeof parsed.leadMatchedCount === "number" ? parsed.leadMatchedCount : null,
      cachedAt: typeof parsed.cachedAt === "number" ? parsed.cachedAt : 0,
    };
  } catch {
    return null;
  }
}

function hasLeadScrapingCacheData(cache: LeadScrapingViewCache | null) {
  if (!cache) return false;
  return Boolean(
    cache.settings ||
      cache.leads.length ||
      cache.latestRunLeads.length ||
      cache.leadTotalCount !== null ||
      cache.leadMatchedCount !== null,
  );
}

function writeLeadScrapingViewCache(cache: LeadScrapingViewCache) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LEAD_SCRAPING_VIEW_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function leadTagPillStyle(color: string | null | undefined) {
  return getReadableTagPillStyle(color, { fallbackTone: "neutral" });
}

function leadContactTagChipStyle(color: string | null | undefined) {
  return getReadableTagPillStyle(color, { fallbackTone: "neutral" });
}
type MeResponse = {
  entitlements?: Record<string, boolean>;
};

type AiCampaignLiteRow = {
  id: string;
  name: string;
  status: string;
};

type SettingsResponse = {
  ok?: boolean;
  settings?: LeadScrapingSettings;
  credits?: number;
  placesConfigured?: boolean;
  b2cUnlocked?: boolean;
  aiCallsUnlocked?: boolean;
  aiCampaignsLite?: AiCampaignLiteRow[];
  error?: string;
};

type LeadsResponse = {
  ok?: boolean;
  totalCount?: number;
  matchedCount?: number;
  leads?: LeadRow[];
  error?: string;
};

type ContactTagsResponse = { ok: true; tags: ContactTag[] } | { ok: false; error?: string };

type RunResponse = {
  ok?: boolean;
  runId?: string;
  requestedCount?: number;
  createdCount?: number;
  createdLeadIds?: string[];
  chargedCredits?: number;
  refundedCredits?: number;
  plannedBatches?: number;
  batchesRan?: number;
  usedFallbackLocations?: string[];
  usedFallbackNiches?: string[];
  error?: string;
  code?: string;
};

type OutboundSendResponse = {
  ok?: boolean;
  sent?: { email?: boolean; sms?: boolean; calls?: boolean };
  skipped?: string[];
  sentAtIso?: string | null;
  error?: string;
};

type OutboundApproveResponse = {
  ok?: boolean;
  approved?: boolean;
  approvedAtIso?: string | null;
  sent?: { email?: boolean; sms?: boolean; calls?: boolean } | null;
  sentAtIso?: string | null;
  skipped?: string[];
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getApiError(body: unknown): string | undefined {
  const obj = asRecord(body);
  return typeof obj.error === "string" ? obj.error : undefined;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function csvEscape(v: string) {
  if (v.includes("\"")) v = v.replaceAll("\"", "\"\"");
  if (/[\n\r,\"]/g.test(v)) return `"${v}"`;
  return v;
}

function toCsv(rows: LeadRow[]) {
  const header = ["businessName", "email", "phone", "website", "address", "niche", "tag", "tagColor", "createdAt"].join(",");
  const lines = rows.map((r) =>
    [
      r.businessName,
      r.email ?? "",
      r.phone ?? "",
      r.website ?? "",
      r.address ?? "",
      r.niche ?? "",
      r.tag ?? "",
      r.tagColor ?? "",
      r.createdAtIso,
    ]
      .map((x) => csvEscape(String(x ?? "")))
      .join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseCsvFirstColumn(text: string, { maxRows = 2000 }: { maxRows?: number } = {}) {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  const rows = raw.split(/\r?\n/).slice(0, maxRows);
  const out: string[] = [];

  for (const r of rows) {
    const line = r.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const first = line.split(",")[0] ?? "";
    const v = first.trim().replace(/^"([\s\S]*)"$/, "$1").trim();
    if (!v) continue;
    out.push(v);
  }

  // Common header values.
  const head = out[0]?.toLowerCase();
  if (head === "value" || head === "domain" || head === "phone" || head === "name") out.shift();

  return out;
}

function normalizeDomainForExclusion(raw: string) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0] ?? s;
  s = s.split("?")[0] ?? s;
  s = s.split("#")[0] ?? s;
  return s.trim();
}

function safeFormatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString();
}

function toTelHref(phone: string) {
  const digits = phone.replace(/\D+/g, "");
  return digits ? `tel:${digits}` : `tel:${phone}`;
}

function isHexColor(s: string) {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

const OUTBOUND_TRIGGER_OPTIONS: Array<PortalListboxOption<"MANUAL" | "ON_SCRAPE" | "ON_APPROVE">> = [
  { value: "MANUAL", label: "Manual only" },
  { value: "ON_SCRAPE", label: "On scrape" },
  { value: "ON_APPROVE", label: "On approve" },
];

const B2B_FREQUENCY_UNIT_OPTIONS: Array<PortalListboxOption<"days" | "weeks" | "months">> = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

function ColorSwatches({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  const colors = (TAG_COLORS as readonly string[]).includes(value)
    ? (TAG_COLORS as readonly string[])
    : ([value, ...TAG_COLORS] as const);

  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {colors.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(c);
            }}
            className={
              selected
                ? "h-7 w-7 rounded-full ring-2 ring-zinc-900 ring-offset-2"
                : "h-7 w-7 rounded-full ring-1 ring-zinc-300 hover:ring-zinc-400"
            }
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          />
        );
      })}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  accent = "blue",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  accent?: "blue" | "pink" | "ink";
}) {
  const checkedBgClass =
    accent === "pink"
      ? "peer-checked:bg-(--color-brand-pink)"
      : accent === "ink"
        ? "peer-checked:bg-brand-ink"
        : "peer-checked:bg-(--color-brand-blue)";

  return (
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-0 rounded-full bg-zinc-200 transition " +
          checkedBgClass +
          " peer-disabled:opacity-60"
        }
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-60"
      />
    </span>
  );
}

export function PortalLeadScrapingClient({ initialB2bSubTab = "leads" }: { initialB2bSubTab?: "pull" | "leads" | "settings" }) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const portalVariant = String(pathname || "").startsWith("/credit") ? "credit" : "portal";
  const portalBasePath = useMemo(() => (portalVariant === "credit" ? "/credit" : "/portal"), [portalVariant]);
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);
  const initialViewCache = useMemo(() => readLeadScrapingViewCache(), []);
  const hasInitialViewCache = hasLeadScrapingCacheData(initialViewCache);
  const [tab, setTab] = useState<"b2b" | "b2c">("b2b");
  const [b2bSubTab, setB2bSubTab] = useState<"pull" | "leads" | "settings">(
    getB2bSubTabFromPathname(pathname, initialB2bSubTab),
  );

  const [leadOutboundEntitled, setLeadOutboundEntitled] = useState(false);
  const [leadOutboundGateReady, setLeadOutboundGateReady] = useState(false);

  const [settings, setSettings] = useState<LeadScrapingSettings | null>(initialViewCache?.settings ?? null);
  const lastSavedSettingsJsonRef = useRef<string | null>(null);
  const currentSettingsJson = useMemo(() => (settings ? JSON.stringify(settings) : null), [settings]);
  const isDirty = Boolean(currentSettingsJson && lastSavedSettingsJsonRef.current && currentSettingsJson !== lastSavedSettingsJsonRef.current);

  const [credits, setCredits] = useState<number | null>(initialViewCache?.credits ?? null);
  const [placesConfigured, setPlacesConfigured] = useState<boolean>(initialViewCache?.placesConfigured ?? false);
  const [aiCallsUnlocked, setAiCallsUnlocked] = useState<boolean>(initialViewCache?.aiCallsUnlocked ?? false);
  const [aiCampaigns, setAiCampaigns] = useState<AiCampaignLiteRow[] | null>(initialViewCache?.aiCampaignsLite ?? null);
  const [contactTagDefs, setContactTagDefs] = useState<ContactTag[]>([]);

  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/people/contacts/custom-variable-keys", {
          cache: "no-store",
          headers: variantHeaders,
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok || !Array.isArray(json.keys)) return;
        const keys = json.keys.map((k: any) => String(k || "").trim()).filter(Boolean).slice(0, 50);
        if (!canceled) setKnownContactCustomVarKeys(keys);
      } catch {
        // ignore
      }
    })();

    return () => {
      canceled = true;
    };
  }, [variantHeaders]);

  const [leads, setLeads] = useState<LeadRow[]>(initialViewCache?.leads ?? []);
  const [latestRunLeads, setLatestRunLeads] = useState<LeadRow[]>(initialViewCache?.latestRunLeads ?? []);
  const [latestRunLeadsBusy, setLatestRunLeadsBusy] = useState(false);
  const [leadAssignees, setLeadAssignees] = useState<LeadAssigneeRow[]>([]);
  const [nurtureCampaigns, setNurtureCampaigns] = useState<NurtureCampaignPickerRow[]>([]);
  const [nurtureCampaignLoadError, setNurtureCampaignLoadError] = useState<string | null>(null);
  const [leadTotalCount, setLeadTotalCount] = useState<number | null>(initialViewCache?.leadTotalCount ?? null);
  const [leadMatchedCount, setLeadMatchedCount] = useState<number | null>(initialViewCache?.leadMatchedCount ?? null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadQueryDebounced, setLeadQueryDebounced] = useState("");
  const [leadsBusy, setLeadsBusy] = useState(false);
  const activeB2bSubTab = getB2bSubTabFromPathname(pathname, b2bSubTab);
  const leadsTake = activeB2bSubTab === "leads" ? 150 : 60;

  useEffect(() => {
    const routeSubTab = getB2bSubTabFromPathname(pathname, initialB2bSubTab);
    setB2bSubTab((prev) => (prev === routeSubTab ? prev : routeSubTab));
  }, [initialB2bSubTab, pathname]);

  const [leadOpen, setLeadOpen] = useState(false);
  const [leadIndex, setLeadIndex] = useState<number>(0);
  const leadRowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const leadListScrollRef = useRef<HTMLDivElement | null>(null);
  const mapBackfillRequestedAtRef = useRef<Map<string, number>>(new Map());
  const mapBackfillInFlightIdsRef = useRef<Set<string>>(new Set());

  const selectedLead = leads[leadIndex] ?? null;
  const activeLead = selectedLead;
  const activeLeadApprovedAt =
    activeLead && settings ? settings.outboundState.approvedAtByLeadId[activeLead.id] ?? null : null;
  const activeLeadSentAt =
    activeLead && settings ? settings.outboundState.sentAtByLeadId[activeLead.id] ?? null : null;

  useEffect(() => {
    if (!leads.length) {
      setLeadIndex(0);
      setLeadOpen(false);
      return;
    }
    setLeadIndex((prev) => Math.max(0, Math.min(leads.length - 1, prev)));
  }, [leads]);

  function updateLeadContactTags(leadId: string, next: ContactTag[]) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, contactTags: next } : l)));
  }

  function normalizeContactTags(input: unknown): ContactTag[] {
    if (!Array.isArray(input)) return [];
    return input
      .map((t: any) => ({
        id: String(t?.id || ""),
        name: String(t?.name || "").slice(0, 60),
        color: typeof t?.color === "string" ? String(t.color) : null,
      }))
      .filter((t) => t.id && t.name);
  }

  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(true);
  const [composeSendSms, setComposeSendSms] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);

  const [composeVarPickerOpen, setComposeVarPickerOpen] = useState(false);
  const [composeVarTarget, setComposeVarTarget] = useState<null | "subject" | "message">(null);
  const composeSubjectRef = useRef<HTMLInputElement | null>(null);
  const composeMessageRef = useRef<HTMLTextAreaElement | null>(null);

  function insertAtCursor(
    current: string,
    insert: string,
    el: HTMLInputElement | HTMLTextAreaElement | null,
  ): { next: string; caret: number } {
    const base = String(current ?? "");
    if (!el) {
      const next = base + insert;
      return { next, caret: next.length };
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : base.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const next = base.slice(0, start) + insert + base.slice(end);
    return { next, caret: start + insert.length };
  }

  function openComposeVarPicker(target: NonNullable<typeof composeVarTarget>) {
    setComposeVarTarget(target);
    setComposeVarPickerOpen(true);
  }

  function applyComposeVariable(variableKey: string) {
    const token = `{${variableKey}}`;
    const setCaretSoon = (el: HTMLInputElement | HTMLTextAreaElement | null, caret: number) => {
      if (!el) return;
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(caret, caret);
        } catch {
          // ignore
        }
      });
    };

    if (composeVarTarget === "subject") {
      const el = composeSubjectRef.current;
      const { next, caret } = insertAtCursor(composeSubject, token, el);
      setComposeSubject(next);
      setCaretSoon(el, caret);
      return;
    }

    if (composeVarTarget === "message") {
      const el = composeMessageRef.current;
      const { next, caret } = insertAtCursor(composeMessage, token, el);
      setComposeMessage(next);
      setCaretSoon(el, caret);
    }
  }

  const [leadMutating, setLeadMutating] = useState(false);
  const [deleteForeverLeadId, setDeleteForeverLeadId] = useState<string | null>(null);
  const [leadEmailDraft, setLeadEmailDraft] = useState("");
  const [leadEmailEditorOpen, setLeadEmailEditorOpen] = useState(false);
  const [leadPhoneDraft, setLeadPhoneDraft] = useState("");
  const [leadPhoneEditorOpen, setLeadPhoneEditorOpen] = useState(false);
  const [leadWebsiteDraft, setLeadWebsiteDraft] = useState("");
  const [leadWebsiteEditorOpen, setLeadWebsiteEditorOpen] = useState(false);
  const [leadTagDraft, setLeadTagDraft] = useState("");
  const [leadTagColorDraft, setLeadTagColorDraft] = useState("#111827");
  const [createLeadTagOpen, setCreateLeadTagOpen] = useState(false);
  const [leadContactTagBusyId, setLeadContactTagBusyId] = useState<string | null>(null);
  const [createContactTagOpen, setCreateContactTagOpen] = useState(false);
  const [createContactTagBusy, setCreateContactTagBusy] = useState(false);
  const [createContactTagName, setCreateContactTagName] = useState("");
  const [createContactTagColor, setCreateContactTagColor] = useState<string>("#2563EB");
  const [assignLeadOpen, setAssignLeadOpen] = useState(false);
  const [assignLeadUserIds, setAssignLeadUserIds] = useState<string[]>([]);
  const [assignLeadBusy, setAssignLeadBusy] = useState(false);
  const [addToNurtureOpen, setAddToNurtureOpen] = useState(false);
  const [selectedNurtureCampaignId, setSelectedNurtureCampaignId] = useState("");
  const [addToNurtureBusy, setAddToNurtureBusy] = useState(false);

  const leadAssigneeOptions = useMemo(
    () =>
      leadAssignees
        .map((row) => {
          const user = row.user;
          if (!user?.id) return null;
          return {
            value: String(row.userId),
            label: (user.name || user.email || row.userId).trim() || row.userId,
            disabled: !user.active,
            hint: user.active ? undefined : "Inactive",
          };
        })
        .filter(Boolean) as Array<{ value: string; label: string; disabled?: boolean; hint?: string }>,
    [leadAssignees],
  );

  const nurtureCampaignOptions = useMemo(
    () =>
      nurtureCampaigns.map((campaign) => ({
        value: String(campaign.id),
        label: String(campaign.name || "Campaign").trim() || "Campaign",
        disabled: String(campaign.status || "") !== "ACTIVE",
        hint:
          String(campaign.status || "") === "ACTIVE"
            ? `${Math.max(0, Number(campaign.stepsCount) || 0)} step${Number(campaign.stepsCount) === 1 ? "" : "s"} • ${Math.max(0, Number(campaign.enrollments?.active) || 0)} active`
            : `${String(campaign.status || "DRAFT").toLowerCase()} • activate first`,
      })),
    [nurtureCampaigns],
  );

  const [outboundBusy, setOutboundBusy] = useState(false);
  const [outboundUploadBusy, setOutboundUploadBusy] = useState(false);
  const [outboundResourcesPickerOpen, setOutboundResourcesPickerOpen] = useState(false);
  const [outboundResourcesPickerChannel, setOutboundResourcesPickerChannel] = useState<null | "email" | "sms">(null);
  const [outboundResourcesMenuOpen, setOutboundResourcesMenuOpen] = useState<null | "email" | "sms">(null);

  const [excludeNameDraft, setExcludeNameDraft] = useState("");
  const [excludeDomainDraft, setExcludeDomainDraft] = useState("");
  const [excludePhoneDraft, setExcludePhoneDraft] = useState("");
  const [excludeAddressDraft, setExcludeAddressDraft] = useState("");
  const [exclusionDraftLists, setExclusionDraftLists] = useState<ExclusionDraftState>(() => createEmptyExclusionDraftState());
  const [exclusionsModalOpen, setExclusionsModalOpen] = useState(false);
  const [exclusionsModalKind, setExclusionsModalKind] = useState<null | ExclusionKind>(null);
  const [exclusionsModalChanged, setExclusionsModalChanged] = useState(false);

  const [excludeCsvBusy, setExcludeCsvBusy] = useState<{ name: boolean; domain: boolean; phone: boolean; address: boolean }>({
    name: false,
    domain: false,
    phone: false,
    address: false,
  });

  function resetExclusionDraftInputs() {
    setExcludeNameDraft("");
    setExcludeDomainDraft("");
    setExcludePhoneDraft("");
    setExcludeAddressDraft("");
  }

  function openExclusionsModal(kind: ExclusionKind | null = null) {
    setExclusionDraftLists(buildExclusionDraftState(settings));
    resetExclusionDraftInputs();
    setExclusionsModalChanged(false);
    setExclusionsModalKind(kind);
    setExclusionsModalOpen(true);
  }

  function closeExclusionsModal() {
    setExclusionsModalOpen(false);
    setExclusionsModalKind(null);
    setExclusionsModalChanged(false);
    setExclusionDraftLists(buildExclusionDraftState(settings));
    resetExclusionDraftInputs();
  }

  function commitExclusionsDrafts() {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            b2b: {
              ...prev.b2b,
              excludeNameContains: exclusionDraftLists.name,
              excludeDomains: exclusionDraftLists.domain,
              excludePhones: exclusionDraftLists.phone,
              excludeAddresses: exclusionDraftLists.address,
            },
          }
        : prev,
    );
  }

  async function importExclusionsCsv(kind: ExclusionKind, file: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("CSV is too large (max 2MB)");
      return;
    }

    setExcludeCsvBusy((prev) => ({ ...prev, [kind]: true }));
    try {
      const text = await file.text();
      const values = parseCsvFirstColumn(text).slice(0, 2000);

      const normalized =
        kind === "domain"
          ? values.map((v) => normalizeDomainForExclusion(v)).filter(Boolean)
          : values.map((v) => v.trim()).filter(Boolean);

      if (!normalized.length) {
        toast.error("No values found in CSV");
        return;
      }

      let added = 0;
      setExclusionDraftLists((prev) => {
        const existing = prev[kind] ?? [];
        const next = Array.from(new Set([...normalized, ...existing])).slice(0, 200);
        added = Math.max(0, next.length - existing.length);
        return { ...prev, [kind]: next };
      });

      if (normalized.length > 0) {
        setExclusionsModalChanged(true);
      }
      toast.success(added > 0 ? `Imported ${added} exclusion${added === 1 ? "" : "s"}` : "Imported (no new exclusions)");
    } catch {
      toast.error("That CSV did not import. Try again here or keep editing this dialog.");
    } finally {
      setExcludeCsvBusy((prev) => ({ ...prev, [kind]: false }));
    }
  }

  function removeExclusionValue(kind: ExclusionKind, value: string) {
    if (exclusionsModalOpen) {
      setExclusionDraftLists((prev) => ({
        ...prev,
        [kind]: prev[kind].filter((entry) => entry !== value),
      }));
      setExclusionsModalChanged(true);
      return;
    }

    setSettings((prev) => {
      if (!prev) return prev;

      if (kind === "name") {
        return {
          ...prev,
          b2b: {
            ...prev.b2b,
            excludeNameContains: prev.b2b.excludeNameContains.filter((entry) => entry !== value),
          },
        };
      }

      if (kind === "domain") {
        return {
          ...prev,
          b2b: {
            ...prev.b2b,
            excludeDomains: prev.b2b.excludeDomains.filter((entry) => entry !== value),
          },
        };
      }

      return {
        ...prev,
        b2b: {
          ...prev.b2b,
          excludePhones:
            kind === "phone"
              ? prev.b2b.excludePhones.filter((entry) => entry !== value)
              : prev.b2b.excludePhones,
          excludeAddresses:
            kind === "address"
              ? prev.b2b.excludeAddresses.filter((entry) => entry !== value)
              : prev.b2b.excludeAddresses,
        },
      };
    });
  }

  function addExclusionValue(kind: ExclusionKind, rawValue?: string) {
    const sourceValue =
      typeof rawValue === "string"
        ? rawValue
        : kind === "name"
          ? excludeNameDraft
          : kind === "domain"
            ? excludeDomainDraft
            : kind === "phone"
              ? excludePhoneDraft
              : excludeAddressDraft;

    const nextValue = kind === "domain" ? normalizeDomainForExclusion(sourceValue) : sourceValue.trim();
    if (!nextValue) return false;

    let added = false;
    setExclusionDraftLists((prev) => {
      const existing = prev[kind] ?? [];
      const next = Array.from(new Set([nextValue, ...existing])).slice(0, 200);
      added = next.length !== existing.length;
      return { ...prev, [kind]: next };
    });

    setExclusionsModalChanged(true);
    if (kind === "name") setExcludeNameDraft("");
    if (kind === "domain") setExcludeDomainDraft("");
    if (kind === "phone") setExcludePhoneDraft("");
    if (kind === "address") setExcludeAddressDraft("");

    return added;
  }

  const [locationSearch, setLocationSearch] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestionRow[]>([]);
  const [locationSuggestionsBusy, setLocationSuggestionsBusy] = useState(false);
  const [locationSuggestionsVisible, setLocationSuggestionsVisible] = useState(false);
  const locationSearchCacheRef = useRef<Map<string, LocationSuggestionRow[]>>(new Map());
  const locationDropdownRef = useRef<HTMLDivElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const locationRequestSeqRef = useRef(0);

  const [b2bFrequencyCount, setB2bFrequencyCount] = useState<number>(1);
  const [b2bFrequencyUnit, setB2bFrequencyUnit] = useState<"days" | "weeks" | "months">("weeks");

  const [outboundVarPickerOpen, setOutboundVarPickerOpen] = useState(false);
  const [outboundVarTarget, setOutboundVarTarget] = useState<
    null | "emailSubject" | "emailMessage" | "smsMessage" | "aiDraftInstruction"
  >(null);
  const outboundActiveFieldElRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const outboundEmailSubjectRef = useRef<HTMLInputElement | null>(null);
  const outboundEmailMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const outboundSmsMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const outboundAiDraftInstructionRef = useRef<HTMLTextAreaElement | null>(null);

  const [outboundAiDraftBusy, setOutboundAiDraftBusy] = useState(false);
  const [outboundAiDraftError, setOutboundAiDraftError] = useState<string | null>(null);
  const [outboundAiDraftInstruction, setOutboundAiDraftInstruction] = useState("");
  const [outboundAiDraftModal, setOutboundAiDraftModal] = useState<
    | null
    | {
        kind: "EMAIL" | "SMS";
        existingSubject?: string;
        existingBody?: string;
        apply: (draft: { subject?: string; body: string }) => void;
      }
  >(null);

  const [aiCampaignsBusy, setAiCampaignsBusy] = useState(false);

  const [templateCustomVariables, setTemplateCustomVariables] = useState<Record<string, string>>({});
  const loadRequestSeqRef = useRef(0);
  const aiCampaignsRequestSeqRef = useRef(0);
  const leadLoadRequestSeqRef = useRef(0);
  const latestRunLeadLoadRequestSeqRef = useRef(0);
  const hasLoadedLeadsOnceRef = useRef(hasInitialViewCache);
  const leadsRef = useRef<LeadRow[]>(initialViewCache?.leads ?? []);
  const latestRunLeadsRef = useRef<LeadRow[]>(initialViewCache?.latestRunLeads ?? []);

  const [loading, setLoading] = useState(!hasInitialViewCache);
  const hasLoadedOnceRef = useRef(hasInitialViewCache);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [cancelingRun, setCancelingRun] = useState(false);
  const runAbortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const estimatedRunCost = useMemo(() => {
    const c = settings?.b2b?.count ?? 0;
    return clampInt(c, 0, 500);
  }, [settings?.b2b?.count]);

  const b2bNicheSelections = useMemo(() => getB2bNicheSelections(settings?.b2b), [settings?.b2b]);
  const b2bLocationSelections = useMemo(() => getB2bLocationSelections(settings?.b2b), [settings?.b2b]);
  const latestRunLeadIds = useMemo(
    () => normalizeUniqueSelections(settings?.b2b?.latestRunLeadIds ?? [], 500),
    [settings?.b2b?.latestRunLeadIds],
  );

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  useEffect(() => {
    latestRunLeadsRef.current = latestRunLeads;
  }, [latestRunLeads]);

  useEffect(() => {
    if (!settings) return;
    writeLeadScrapingViewCache({
      settings,
      credits,
      placesConfigured,
      aiCallsUnlocked,
      aiCampaignsLite: aiCampaigns,
      leads,
      latestRunLeads,
      leadTotalCount,
      leadMatchedCount,
      cachedAt: Date.now(),
    });
  }, [aiCallsUnlocked, aiCampaigns, credits, latestRunLeads, leadMatchedCount, leadTotalCount, leads, placesConfigured, settings]);

  const nicheKeywordOptions = useMemo<PortalMultiSelectOption[]>(() => {
    const next = normalizeUniqueSelections([...b2bNicheSelections, ...SCRAPER_NICHE_SUGGESTIONS]);
    return next.map((value) => ({ value, label: value }));
  }, [b2bNicheSelections]);

  useEffect(() => {
    const query = locationSearch.trim();
    if (!query) {
      setLocationSuggestionsBusy(false);
      setLocationSuggestionsVisible(false);
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = locationSearchCacheRef.current.get(cacheKey);
    if (cached?.length) {
      setLocationSuggestions(cached);
      setLocationSuggestionsBusy(false);
      return;
    }

    const requestSeq = ++locationRequestSeqRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLocationSuggestionsBusy(true);
      try {
        const res = await fetch(`/api/portal/lead-scraping/location-suggestions?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          headers: variantHeaders,
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => ({}))) as any;
        if (requestSeq !== locationRequestSeqRef.current) return;
        if (!res.ok || body?.ok !== true || !Array.isArray(body?.suggestions)) return;

        const next = (body.suggestions as any[])
          .map((row) => ({
            value: String(row?.value || "").trim(),
            label: String(row?.label || row?.value || "").trim(),
          }))
          .filter((row) => row.value && row.label)
          .slice(0, 10);

        locationSearchCacheRef.current.set(cacheKey, next);
        setLocationSuggestions(next);
      } catch {
        // Keep the last visible suggestions until something better arrives.
      } finally {
        if (requestSeq === locationRequestSeqRef.current) {
          setLocationSuggestionsBusy(false);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [locationSearch, variantHeaders]);

  useEffect(() => {
    if (!locationSuggestionsVisible) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (locationDropdownRef.current?.contains(event.target as Node)) return;
      setLocationSuggestionsVisible(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [locationSuggestionsVisible]);

  useEffect(() => {
    if (!outboundResourcesMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.("[data-lead-outbound-resources-menu='true']")) return;
      setOutboundResourcesMenuOpen(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOutboundResourcesMenuOpen(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [outboundResourcesMenuOpen]);

  const plannedBatchesUi = useMemo(() => {
    const c = settings?.b2b?.count ?? 0;
    const base = Math.max(1, Math.ceil(Math.max(0, c) / 60));
    const extra = c >= 50 ? 1 : 0;
    return Math.min(10, base + extra);
  }, [settings?.b2b?.count]);

  const canLoadAiCampaigns = aiCallsUnlocked || leadOutboundEntitled;

  const sortedLeads = useCallback(
    (rows: LeadRow[]) =>
      [...rows].sort((a, b) => (Number(b.starred) - Number(a.starred) || b.createdAtIso.localeCompare(a.createdAtIso))),
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setLeadQueryDebounced(leadQuery.trim()), 250);
    return () => window.clearTimeout(t);
  }, [leadQuery]);

  const loadLeads = useCallback(
    async (q: string, opts?: { preserveOnError?: boolean }) => {
      const requestSeq = ++leadLoadRequestSeqRef.current;
      setLeadsBusy(true);
      const qs = new URLSearchParams();
      qs.set("take", String(leadsTake));
      if (q) qs.set("q", q);
      qs.set("kind", "B2B");
      qs.set("includeCounts", "0");
      qs.set("includeContactTags", "0");

      try {
        const leadsRes = await fetch(`/api/portal/lead-scraping/leads?${qs.toString()}`, {
          cache: "no-store",
          headers: variantHeaders,
        });
        const leadsBody = (await leadsRes.json().catch(() => ({}))) as LeadsResponse;

        if (leadsRes.ok) {
          if (requestSeq !== leadLoadRequestSeqRef.current) return;
          const nextLeads = sortedLeads(Array.isArray(leadsBody.leads) ? leadsBody.leads : []);
          hasLoadedLeadsOnceRef.current = true;
          if (!q && nextLeads.length === 0 && leadsRef.current.length > 0) {
            return;
          }
          setLeads(nextLeads);
          setLeadTotalCount(typeof leadsBody.totalCount === "number" ? leadsBody.totalCount : null);
          setLeadMatchedCount(typeof leadsBody.matchedCount === "number" ? leadsBody.matchedCount : null);
        } else if (opts?.preserveOnError === false) {
          if (requestSeq !== leadLoadRequestSeqRef.current) return;
          setLeads([]);
          setLeadTotalCount(null);
          setLeadMatchedCount(null);
        }
      } catch {
        if (opts?.preserveOnError === false) {
          if (requestSeq !== leadLoadRequestSeqRef.current) return;
          setLeads([]);
          setLeadTotalCount(null);
          setLeadMatchedCount(null);
        }
      } finally {
        if (requestSeq === leadLoadRequestSeqRef.current) {
          setLeadsBusy(false);
        }
      }
    },
    [leadsTake, sortedLeads, variantHeaders],
  );

  const loadLatestRunLeads = useCallback(
    async (leadIds: string[], opts?: { preserveOnError?: boolean }) => {
      const requestSeq = ++latestRunLeadLoadRequestSeqRef.current;
      const ids = normalizeUniqueSelections(leadIds, 500);

      setLatestRunLeadsBusy(true);
      const qs = new URLSearchParams();
      qs.set("take", String(Math.min(200, Math.max(1, ids.length || 20))));
      qs.set("kind", "B2B");
      qs.set("includeCounts", "0");
      qs.set("includeContactTags", "0");
      if (ids.length) {
        for (const id of ids) qs.append("id", id);
      } else {
        qs.set("recentBatch", "1");
      }

      try {
        const leadsRes = await fetch(`/api/portal/lead-scraping/leads?${qs.toString()}`, {
          cache: "no-store",
          headers: variantHeaders,
        });
        const leadsBody = (await leadsRes.json().catch(() => ({}))) as LeadsResponse;

        if (leadsRes.ok) {
          if (requestSeq !== latestRunLeadLoadRequestSeqRef.current) return;
          const nextLeads = sortedLeads(Array.isArray(leadsBody.leads) ? leadsBody.leads : []);
          if (!ids.length && nextLeads.length === 0 && latestRunLeadsRef.current.length > 0) {
            return;
          }
          setLatestRunLeads(nextLeads);
        } else if (opts?.preserveOnError === false) {
          if (requestSeq !== latestRunLeadLoadRequestSeqRef.current) return;
          setLatestRunLeads([]);
        }
      } catch {
        if (opts?.preserveOnError === false) {
          if (requestSeq !== latestRunLeadLoadRequestSeqRef.current) return;
          setLatestRunLeads([]);
        }
      } finally {
        if (requestSeq === latestRunLeadLoadRequestSeqRef.current) {
          setLatestRunLeadsBusy(false);
        }
      }
    },
    [sortedLeads, variantHeaders],
  );

  const mergeLeadCoordinates = useCallback((updates: Array<{ id: string; latitude: number; longitude: number }>) => {
    if (!updates.length) return;
    const updateMap = new Map(updates.map((row) => [String(row.id), row]));
    const apply = (rows: LeadRow[]) =>
      rows.map((lead) => {
        const next = updateMap.get(String(lead.id));
        if (!next) return lead;
        return {
          ...lead,
          latitude: next.latitude,
          longitude: next.longitude,
        };
      });

    setLeads((prev) => apply(prev));
    setLatestRunLeads((prev) => apply(prev));
  }, []);

  const requestMapBackfill = useCallback(
    async (rows: LeadRow[]) => {
      const now = Date.now();
      const candidateIds = Array.from(
        new Set(
          rows
            .filter((lead) => lead.latitude == null || lead.longitude == null)
            .map((lead) => String(lead.id || "").trim())
            .filter(Boolean),
        ),
      ).filter((id) => {
        if (mapBackfillInFlightIdsRef.current.has(id)) return false;
        const lastRequestedAt = mapBackfillRequestedAtRef.current.get(id) ?? 0;
        return now - lastRequestedAt > 60_000;
      });

      if (!candidateIds.length) return;

      candidateIds.forEach((id) => mapBackfillInFlightIdsRef.current.add(id));
      try {
        const res = await fetch("/api/portal/lead-scraping/backfill-map", {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify({ leadIds: candidateIds }),
        });
        const body = (await res.json().catch(() => ({}))) as { updated?: Array<{ id: string; latitude: number; longitude: number }> };
        if (res.ok && Array.isArray(body.updated) && body.updated.length) {
          mergeLeadCoordinates(
            body.updated
              .map((row) => ({
                id: String(row.id || "").trim(),
                latitude: Number(row.latitude),
                longitude: Number(row.longitude),
              }))
              .filter((row) => row.id && Number.isFinite(row.latitude) && Number.isFinite(row.longitude)),
          );
        }
      } finally {
        candidateIds.forEach((id) => {
          mapBackfillInFlightIdsRef.current.delete(id);
          mapBackfillRequestedAtRef.current.set(id, Date.now());
        });
      }
    },
    [mergeLeadCoordinates, variantHeaders],
  );
  const isLeadMapLayout = tab === "b2b" && activeB2bSubTab === "leads";

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden: isLeadMapLayout } }));
    return () => {
      window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden: false } }));
    };
  }, [isLeadMapLayout]);

  const load = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    const activeLoadMode: "pull" | "leads" | "settings" = tab === "b2b" ? activeB2bSubTab : "leads";
    const requestSeq = ++loadRequestSeqRef.current;
    if (isFirstLoad) setLoading(true);
    setError(null);
    setLeadOutboundGateReady(false);

    let didLoad = false;

    try {
      const needsLeadWorkspaceData = tab === "b2b" && activeB2bSubTab === "leads";
      const settingsRes = await fetch("/api/portal/lead-scraping/settings", { cache: "no-store", headers: variantHeaders });

      if (requestSeq !== loadRequestSeqRef.current) return;

      const settingsBody = (await settingsRes.json().catch(() => ({}))) as SettingsResponse;

      if (!needsLeadWorkspaceData) {
        setContactTagDefs([]);
        setLeadAssignees([]);
        setNurtureCampaigns([]);
        setNurtureCampaignLoadError(null);
        setTemplateCustomVariables({});
      }

      if (!settingsRes.ok) {
        setError(getApiError(settingsBody) ?? getLeadScrapingLoadErrorMessage(activeLoadMode));
        return;
      }

      const nextSettings = normalizeLeadScrapingSettingsShape(settingsBody.settings ?? null);
      const shouldPreserveLocalDraft = !isFirstLoad && isDirtyRef.current;
      if (!shouldPreserveLocalDraft) {
        setSettings(nextSettings);
        lastSavedSettingsJsonRef.current = nextSettings ? JSON.stringify(nextSettings) : null;
      }
      setCredits(typeof settingsBody.credits === "number" ? settingsBody.credits : null);
      setPlacesConfigured(Boolean(settingsBody.placesConfigured));
      const aiUnlocked = Boolean(settingsBody.aiCallsUnlocked);
      setAiCallsUnlocked(aiUnlocked);
      const nextAiCampaigns = normalizeAiCampaignLiteRows(settingsBody.aiCampaignsLite);
      setAiCampaigns(aiUnlocked && nextAiCampaigns.length === 0 ? null : nextAiCampaigns);
      if (aiUnlocked) {
        setLeadOutboundGateReady(true);
      }

      void (async () => {
        const meRes = await fetch("/api/customer/me", {
          cache: "no-store",
          headers: {
            "x-pa-app": "portal",
            ...variantHeaders,
          },
        }).catch(() => null as Response | null);
        if (requestSeq !== loadRequestSeqRef.current) return;
        const meBody = (await meRes?.json().catch(() => ({}))) as MeResponse;
        setLeadOutboundEntitled(Boolean(meBody.entitlements && (meBody.entitlements as any).leadOutbound));
        setLeadOutboundGateReady(true);
      })();

      if (needsLeadWorkspaceData) {
        void (async () => {
          if (typeof window !== "undefined") await new Promise((resolve) => window.setTimeout(resolve, 1500));
          const [tagsRes, customVarsRes, assigneesRes, nurtureCampaignsRes] = await Promise.all([
            fetch("/api/portal/contact-tags", { cache: "no-store", headers: variantHeaders }).catch(() => null as Response | null),
            fetch("/api/portal/follow-up/custom-variables", { cache: "no-store", headers: variantHeaders }).catch(() => null as Response | null),
            fetch("/api/portal/lead-scraping/assignees", { cache: "no-store", headers: variantHeaders }).catch(() => null as Response | null),
            fetch("/api/portal/nurture/campaigns", { cache: "no-store", headers: variantHeaders }).catch(() => null as Response | null),
          ]);

          if (requestSeq !== loadRequestSeqRef.current) return;

          const tagsBody = (await tagsRes?.json().catch(() => ({}))) as ContactTagsResponse | any;
          if (tagsRes?.ok && tagsBody && tagsBody.ok === true && Array.isArray(tagsBody.tags)) {
            setContactTagDefs(tagsBody.tags as ContactTag[]);
          } else {
            setContactTagDefs([]);
          }

          const assigneesBody = (await assigneesRes?.json().catch(() => ({}))) as any;
          if (assigneesRes?.ok && assigneesBody && assigneesBody.ok === true && Array.isArray(assigneesBody.members)) {
            setLeadAssignees(assigneesBody.members as LeadAssigneeRow[]);
          } else {
            setLeadAssignees([]);
          }

          const nurtureCampaignsBody = (await nurtureCampaignsRes?.json().catch(() => ({}))) as any;
          if (nurtureCampaignsRes?.ok && nurtureCampaignsBody && nurtureCampaignsBody.ok === true && Array.isArray(nurtureCampaignsBody.campaigns)) {
            setNurtureCampaigns(nurtureCampaignsBody.campaigns as NurtureCampaignPickerRow[]);
            setNurtureCampaignLoadError(null);
          } else {
            setNurtureCampaigns([]);
            setNurtureCampaignLoadError(getApiError(nurtureCampaignsBody) ?? null);
          }

          const customVarsBody = (await customVarsRes?.json().catch(() => ({}))) as any;
          if (customVarsRes?.ok && customVarsBody && customVarsBody.ok === true) {
            const raw =
              customVarsBody.customVariables && typeof customVarsBody.customVariables === "object" && !Array.isArray(customVarsBody.customVariables)
                ? (customVarsBody.customVariables as Record<string, unknown>)
                : {};
            const normalized = Object.fromEntries(
              Object.entries(raw)
                .filter(([k, v]) => typeof k === "string" && typeof v === "string")
                .map(([k, v]) => [k.trim(), String(v)])
                .filter(([k]) => Boolean(k))
                .slice(0, 60),
            ) as Record<string, string>;
            setTemplateCustomVariables(normalized);
          } else {
            setTemplateCustomVariables({});
          }
        })();
      }

      didLoad = true;
    } finally {
      if (requestSeq === loadRequestSeqRef.current) {
        if (didLoad) hasLoadedOnceRef.current = true;
        setLoading(false);
      }
    }
  }, [activeB2bSubTab, tab, variantHeaders]);

  const leadOutboundTemplateVariables = useMemo(() => {
    const serviceCustom: TemplateVariable[] = Object.keys(templateCustomVariables)
      .map((key) => key.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 60)
      .map((key) => ({
        key,
        label: key,
        group: "Custom" as const,
        appliesTo: "Custom",
      }));

    const contactCustom: TemplateVariable[] = (Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [])
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 50)
      .map((k) => ({
        key: `contact.custom.${k}`,
        label: `Contact custom: ${k}`,
        group: "Custom",
        appliesTo: "Lead/contact",
      }));

    const base: TemplateVariable[] = [...LEAD_OUTBOUND_VARIABLES, ...contactCustom, ...serviceCustom];
    const seen = new Set<string>();
    return base.filter((v) => {
      const key = `${v.group}:${v.key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [knownContactCustomVarKeys, templateCustomVariables]);

  const leadOutboundExistingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const v of LEAD_OUTBOUND_VARIABLES) keys.add(v.key);
    for (const k of Object.keys(templateCustomVariables ?? {})) keys.add(String(k || "").trim());
    return [...keys].filter(Boolean);
  }, [templateCustomVariables]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const days = Math.max(1, Math.floor(Number(settings?.b2b?.frequencyDays) || 7));
    if (days % 30 === 0) {
      setB2bFrequencyUnit("months");
      setB2bFrequencyCount(Math.max(1, Math.floor(days / 30)));
      return;
    }
    if (days % 7 === 0) {
      setB2bFrequencyUnit("weeks");
      setB2bFrequencyCount(Math.max(1, Math.floor(days / 7)));
      return;
    }
    setB2bFrequencyUnit("days");
    setB2bFrequencyCount(days);
  }, [settings?.b2b?.frequencyDays]);

  const loadAiCampaigns = useCallback(async () => {
    if (!canLoadAiCampaigns) return;

    const requestSeq = ++aiCampaignsRequestSeqRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setAiCampaignsBusy(true);

    try {
      const res = await fetch("/api/portal/ai-outbound-calls/campaigns?lite=1", {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "x-pa-app": "portal",
          ...variantHeaders,
        },
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (requestSeq !== aiCampaignsRequestSeqRef.current) return;
      if (!res.ok || json?.ok !== true || !Array.isArray(json?.campaigns)) {
        setAiCampaigns([]);
        return;
      }

      setAiCampaigns(
        (json.campaigns as any[])
          .map((c) => ({ id: String(c?.id || ""), name: String(c?.name || ""), status: String(c?.status || "") }))
          .filter((c) => c.id && c.name)
          .slice(0, 200),
      );
    } catch {
      if (requestSeq !== aiCampaignsRequestSeqRef.current) return;
      setAiCampaigns([]);
    } finally {
      window.clearTimeout(timeout);
      controller.abort();
      if (requestSeq === aiCampaignsRequestSeqRef.current) {
        setAiCampaignsBusy(false);
      }
    }
  }, [canLoadAiCampaigns, variantHeaders]);

  useEffect(() => {
    if (!canLoadAiCampaigns) return;
    if (aiCampaigns !== null) return;
    if (aiCampaignsBusy) return;
    void loadAiCampaigns();
  }, [aiCampaigns, aiCampaignsBusy, canLoadAiCampaigns, loadAiCampaigns]);

  useEffect(() => {
    if (loading) return;
    if (tab !== "b2b") return;
    if (b2bSubTab !== "leads") return;
    void loadLeads(leadQueryDebounced);
  }, [b2bSubTab, leadQueryDebounced, loadLeads, loading, tab]);

  useEffect(() => {
    if (loading) return;
    if (tab !== "b2b") return;
    if (b2bSubTab !== "pull") return;
    void loadLatestRunLeads(latestRunLeadIds, { preserveOnError: true });
  }, [b2bSubTab, latestRunLeadIds, loadLatestRunLeads, loading, tab]);

  useEffect(() => {
    if (loading) return;
    if (tab !== "b2b") return;
    if (b2bSubTab !== "leads") return;
    if (!leads.length) return;
    void requestMapBackfill(leads);
  }, [b2bSubTab, leads, loading, requestMapBackfill, tab]);

  useEffect(() => {
    if (loading) return;
    if (tab !== "b2b") return;
    if (b2bSubTab !== "pull") return;
    if (!latestRunLeads.length) return;
    void requestMapBackfill(latestRunLeads);
  }, [b2bSubTab, latestRunLeads, loading, requestMapBackfill, tab]);

  async function save(): Promise<boolean> {
    if (!settings) return false;
    setSaving(true);
    setError(null);

    const outboundEnabled = Boolean(
      settings.outbound?.email?.enabled ||
        settings.outbound?.sms?.enabled ||
        Boolean((settings.outbound as any)?.aiDraftAndSend),
    );
    const normalizedSettings: LeadScrapingSettings = {
      ...normalizeLeadScrapingSettingsForSave(settings),
      outbound: {
        ...settings.outbound,
        enabled: outboundEnabled,
      },
    };

    const res = await fetch("/api/portal/lead-scraping/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ settings: normalizedSettings }),
    });

    const body = (await res.json().catch(() => ({}))) as SettingsResponse;
    setSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Lead scraping settings did not save. Retry here or open settings to review them.");
      return false;
    }

    const nextSettings = normalizeLeadScrapingSettingsShape(body.settings ?? settings);
    setSettings(nextSettings);
    lastSavedSettingsJsonRef.current = nextSettings ? JSON.stringify(nextSettings) : null;
    setCredits(typeof body.credits === "number" ? body.credits : credits);
    toast.success("Saved");
    return true;
  }

  async function runB2bNow() {
    if (!settings) return;

    const saved = await save();
    if (!saved) return;

    const runId = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

    activeRunIdRef.current = runId;
    setRunning(true);
    setCancelingRun(false);
    setError(null);
    const controller = new AbortController();
    runAbortRef.current = controller;

    toast.info(plannedBatchesUi > 1 ? `Running ${plannedBatchesUi} batches…` : "1 running");

    let res: Response;
    try {
      res = await fetch("/api/portal/lead-scraping/run", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ kind: "B2B", runId }),
        signal: controller.signal,
      });
    } catch (error) {
      runAbortRef.current = null;
      setRunning(false);
      activeRunIdRef.current = null;
      if (error instanceof Error && error.name === "AbortError") {
        toast.info("Run canceled.");
        setCancelingRun(false);
        return;
      }
      setError("That run did not start. Retry here, open settings, or ask Pura to help.");
      setCancelingRun(false);
      return;
    }

    const body = (await res.json().catch(() => ({}))) as RunResponse;
    runAbortRef.current = null;
    setRunning(false);
    activeRunIdRef.current = null;
    setCancelingRun(false);

    if (!res.ok) {
      if (body?.code === "RUN_CANCELED") {
        toast.info("Run canceled.");
        return;
      }
      if (res.status === 402 && body?.code === "INSUFFICIENT_CREDITS") {
        setError(body.error ?? "Not enough credits.");
      } else {
        setError(getApiError(body) ?? "That run did not start. Retry here, open settings, or ask Pura to help.");
      }
      return;
    }

    const created = typeof body.createdCount === "number" ? body.createdCount : 0;
    const charged = typeof body.chargedCredits === "number" ? body.chargedCredits : 0;
    const refunded = typeof body.refundedCredits === "number" ? body.refundedCredits : 0;
    const requested =
      typeof body.requestedCount === "number" ? body.requestedCount : (settings?.b2b?.count ?? 0);
    if (requested > 0 && created < requested) {
      toast.success(
        `Found ${created} lead${created === 1 ? "" : "s"} within these constraints • Requested ${requested} • Charged ${charged} credit${charged === 1 ? "" : "s"}${refunded ? ` • Refunded ${refunded}` : ""}`,
      );
    } else {
      toast.success(
        created > 0
          ? `Added ${created} lead${created === 1 ? "" : "s"} • Charged ${charged} credit${charged === 1 ? "" : "s"}${refunded ? ` • Refunded ${refunded}` : ""}`
          : `No new leads matched${refunded ? ` (refunded ${refunded} credits)` : ""}`,
      );
    }

    await load();
  }

  async function cancelB2bRun() {
    const runId = activeRunIdRef.current;
    setCancelingRun(true);
    toast.info("Canceling run…");
    runAbortRef.current?.abort();
    runAbortRef.current = null;

    if (!runId) {
      setCancelingRun(false);
      return;
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch("/api/portal/lead-scraping/run/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ runId }),
      }).catch(() => null as Response | null);

      if (res?.ok) {
        activeRunIdRef.current = null;
        setCancelingRun(false);
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    activeRunIdRef.current = null;
    setCancelingRun(false);
  }

  async function uploadOutboundFile(channel: "email" | "sms", file: File) {
    setOutboundUploadBusy(true);
    setError(null);

    const form = new FormData();
    form.append("files", file);

    const res = await fetch("/api/portal/media/items", { method: "POST", headers: variantHeaders, body: form });
    const body = (await res.json().catch(() => ({}))) as any;
    setOutboundUploadBusy(false);

    if (!res.ok) {
      const errorText = typeof body?.error === "string" ? body.error : null;
      setError(errorText ?? "That file did not upload. Try again here or reopen this panel.");
      toast.error(errorText ?? "That file did not upload. Try again here or reopen this panel.");
      return;
    }

    const item = Array.isArray(body?.items) ? body.items[0] : null;
    const url = typeof item?.shareUrl === "string" ? item.shareUrl : "";
    const label = typeof item?.fileName === "string" && item.fileName.trim() ? String(item.fileName).trim().slice(0, 120) : file.name.slice(0, 120);
    if (!url) {
      setError("That file did not attach. Try again here or choose a different file.");
      toast.error("That file did not attach. Try again here or choose a different file.");
      return;
    }

    setSettings((prev) =>
      prev
        ? {
            ...prev,
            outbound: updateOutboundResourcesForChannel(prev.outbound, channel, [
              { label, url },
              ...getOutboundResourcesForChannel(prev.outbound, channel),
            ]),
          }
        : prev,
    );
    toast.success("Uploaded");
  }

  function openOutboundVarPicker(target: NonNullable<typeof outboundVarTarget>) {
    setOutboundVarTarget(target);
    setOutboundVarPickerOpen(true);
  }

  function applyOutboundVariable(variableKey: string) {
    const token = `{${variableKey}}`;

    const setCaretSoon = (el: HTMLInputElement | HTMLTextAreaElement | null, caret: number) => {
      if (!el) return;
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(caret, caret);
        } catch {
          // ignore
        }
      });
    };

    if (outboundVarTarget === "emailSubject") {
      const el = outboundEmailSubjectRef.current;
      let nextCaret = 0;
      setSettings((prev) => {
        if (!prev) return prev;
        const current = prev.outbound.email.subject;
        const { next, caret } = insertAtCursor(current, token, el);
        nextCaret = caret;
        return {
          ...prev,
          outbound: { ...prev.outbound, email: { ...prev.outbound.email, subject: next } },
        };
      });
      setCaretSoon(el, nextCaret);
      return;
    }

    if (outboundVarTarget === "emailMessage") {
      const el = outboundEmailMessageRef.current;
      let nextCaret = 0;
      setSettings((prev) => {
        if (!prev) return prev;
        const current = prev.outbound.email.text;
        const { next, caret } = insertAtCursor(current, token, el);
        nextCaret = caret;
        return {
          ...prev,
          outbound: { ...prev.outbound, email: { ...prev.outbound.email, text: next } },
        };
      });
      setCaretSoon(el, nextCaret);
      return;
    }

    if (outboundVarTarget === "smsMessage") {
      const el = outboundSmsMessageRef.current;
      let nextCaret = 0;
      setSettings((prev) => {
        if (!prev) return prev;
        const current = prev.outbound.sms.text;
        const { next, caret } = insertAtCursor(current, token, el);
        nextCaret = caret;
        return {
          ...prev,
          outbound: { ...prev.outbound, sms: { ...prev.outbound.sms, text: next } },
        };
      });
      setCaretSoon(el, nextCaret);
      return;
    }

    if (outboundVarTarget === "aiDraftInstruction") {
      const el = outboundAiDraftInstructionRef.current;
      const { next, caret } = insertAtCursor(outboundAiDraftInstruction, token, el);
      setOutboundAiDraftInstruction(next);
      setCaretSoon(el, caret);
    }
  }

  async function generateOutboundTemplateDraft(opts: {
    kind: "EMAIL" | "SMS";
    prompt?: string;
    existingSubject?: string;
    existingBody?: string;
  }): Promise<{ subject?: string; body: string } | null> {
    const res = await fetch("/api/portal/lead-scraping/outbound/ai/draft-template", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({
        kind: opts.kind,
        prompt: opts.prompt,
        existingSubject: opts.existingSubject,
        existingBody: opts.existingBody,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = (json as any)?.code;
      if (res.status === 402 && code === "INSUFFICIENT_CREDITS") {
        toast.error("Insufficient credits to generate.");
        return null;
      }
      toast.error((json as any)?.error || "That outbound draft did not generate. Try again here or keep editing the instructions.");
      return null;
    }

    const rawSubject = String((json as any)?.subject ?? "");
    const rawBody = String((json as any)?.body ?? "");

    const stripCodeFence = (s: string) => {
      const t = s.trim();
      if (!t.startsWith("```")) return s;
      const lines = t.split("\n");
      if (lines.length < 3) return s;
      if (!lines[0].startsWith("```")) return s;
      let endIdx = -1;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i]?.trim().startsWith("```")) {
          endIdx = i;
          break;
        }
      }
      if (endIdx <= 0) return s;
      return lines.slice(1, endIdx).join("\n").trim();
    };

    const tryParseDraftJson = (s: string): { subject?: unknown; body?: unknown } | null => {
      const t = stripCodeFence(String(s ?? "")).trim();
      if (!t.startsWith("{") || !t.endsWith("}")) return null;
      try {
        const parsed = JSON.parse(t);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        return parsed as any;
      } catch {
        return null;
      }
    };

    const parsedFromBody = tryParseDraftJson(rawBody);
    const parsedFromSubject = tryParseDraftJson(rawSubject);
    const parsed = parsedFromBody ?? parsedFromSubject;

    const subjectCoerced = parsed && "subject" in parsed ? String((parsed as any).subject ?? "") : rawSubject;
    const bodyCoerced = parsed && "body" in parsed ? String((parsed as any).body ?? "") : rawBody;

    if (opts.kind === "EMAIL") {
      return {
        subject: subjectCoerced.slice(0, 200),
        body: bodyCoerced.slice(0, 8000),
      };
    }

    return { body: bodyCoerced.slice(0, 8000) };
  }

  async function sendDefaultOutbound(leadId: string) {
    setOutboundBusy(true);
    setError(null);

    const res = await fetch("/api/portal/lead-scraping/outbound/send", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ leadId }),
    });

    const body = (await res.json().catch(() => ({}))) as OutboundSendResponse;
    setOutboundBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "That outbound message did not send. Retry here or review the outbound setup.");
      return;
    }

    const sentAtIso = typeof body.sentAtIso === "string" ? body.sentAtIso : null;
    if (sentAtIso) {
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              outboundState: {
                ...prev.outboundState,
                sentAtByLeadId: { ...prev.outboundState.sentAtByLeadId, [leadId]: sentAtIso },
              },
            }
          : prev,
      );
    }

    const skipped = Array.isArray(body.skipped) ? body.skipped : [];
    toast.success(skipped.length ? `Sent (with skips): ${skipped[0]}` : "Sent");
  }

  async function setLeadApproved(leadId: string, approved: boolean) {
    setOutboundBusy(true);
    setError(null);

    const res = await fetch("/api/portal/lead-scraping/outbound/approve", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ leadId, approved }),
    });

    const body = (await res.json().catch(() => ({}))) as OutboundApproveResponse;
    setOutboundBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Approval did not update. Retry here or review the outbound setup.");
      return;
    }

    const approvedAtIso = typeof body.approvedAtIso === "string" ? body.approvedAtIso : null;
    const sentAtIso = typeof body.sentAtIso === "string" ? body.sentAtIso : null;

    setSettings((prev) => {
      if (!prev) return prev;
      const nextApproved = { ...prev.outboundState.approvedAtByLeadId };
      if (approved && approvedAtIso) nextApproved[leadId] = approvedAtIso;
      else delete nextApproved[leadId];

      const nextSent = { ...prev.outboundState.sentAtByLeadId };
      if (sentAtIso) nextSent[leadId] = sentAtIso;

      return {
        ...prev,
        outboundState: {
          ...prev.outboundState,
          approvedAtByLeadId: nextApproved,
          sentAtByLeadId: nextSent,
        },
      };
    });

    const skipped = Array.isArray(body.skipped) ? body.skipped : [];
    toast.success(skipped.length ? `Updated (with skips): ${skipped[0]}` : "Updated");
  }

  const openLeadAtIndex = useCallback((nextIndex: number) => {
    if (!leads.length) return;
    const idx = Math.max(0, Math.min(leads.length - 1, Math.floor(nextIndex)));
    setLeadIndex(idx);
    setLeadOpen(true);
  }, [leads]);

  const scrollLeadRowToTop = useCallback((leadId: string, behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const row = leadRowRefs.current.get(leadId);
      const scroller = leadListScrollRef.current;
      if (row && scroller) {
        const rowRect = row.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const nextTop = scroller.scrollTop + (rowRect.top - scrollerRect.top);
        scroller.scrollTo({ top: Math.max(0, nextTop), behavior });
        return;
      }
      row?.scrollIntoView({ block: "start", behavior });
    });
  }, []);

  const selectLeadAtIndex = useCallback(
    (nextIndex: number, opts?: { scrollIntoView?: boolean }) => {
      if (!leads.length) return;
      const idx = Math.max(0, Math.min(leads.length - 1, Math.floor(nextIndex)));
      const lead = leads[idx] ?? null;
      setLeadIndex(idx);
      if (opts?.scrollIntoView && lead?.id) {
        scrollLeadRowToTop(lead.id);
      }
    },
    [leads, scrollLeadRowToTop],
  );

  const selectLeadById = useCallback(
    (leadId: string, opts?: { scrollIntoView?: boolean }) => {
      const idx = leads.findIndex((lead) => lead.id === leadId);
      if (idx < 0) return;
      selectLeadAtIndex(idx, opts);
    },
    [leads, selectLeadAtIndex],
  );

  useEffect(() => {
    if (tab !== "b2b" || b2bSubTab !== "leads") return;
    if (!leads.length || typeof window === "undefined") return;
    const pendingLeadId = window.sessionStorage.getItem(PENDING_MAP_LEAD_STORAGE_KEY);
    if (!pendingLeadId) return;
    const idx = leads.findIndex((lead) => lead.id === pendingLeadId);
    if (idx < 0) return;
    window.sessionStorage.removeItem(PENDING_MAP_LEAD_STORAGE_KEY);
    selectLeadAtIndex(idx, { scrollIntoView: true });
  }, [b2bSubTab, leads, selectLeadAtIndex, tab]);

  useEffect(() => {
    if (tab === "b2b" && activeB2bSubTab === "leads") return;
    setLeadOpen(false);
    setCreateLeadTagOpen(false);
    setCreateContactTagOpen(false);
  }, [activeB2bSubTab, activeLead?.id, tab]);

  function closeLead() {
    const activeLeadId = activeLead?.id ?? null;
    setLeadOpen(false);
    if (activeLeadId && isLeadMapLayout) {
      scrollLeadRowToTop(activeLeadId);
    }
  }

  async function sendLeadMessage() {
    if (!activeLead) return;

    const msg = composeMessage.trim();
    if (!msg) {
      setError("Please enter a message.");
      return;
    }
    if (!composeSendEmail && !composeSendSms) {
      setError("Choose Email and/or SMS.");
      return;
    }

    const subject = composeSubject.trim();
    if (composeSendEmail && subject.length > 120) {
      setError("Subject is too long (max 120 characters).");
      return;
    }

    if (composeSendEmail && !activeLead.email) {
      setError("Add an email address to this lead to send email.");
      return;
    }
    if (composeSendSms && !activeLead.phone) {
      setError("This lead has no phone number.");
      return;
    }

    setComposeBusy(true);
    setError(null);

    const res = await fetch("/api/portal/lead-scraping/contact", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({
        leadId: activeLead.id,
        subject,
        message: msg,
        sendEmail: composeSendEmail,
        sendSms: composeSendSms,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setComposeBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "That message did not send. Retry here or review this lead first.");
      return;
    }

    setComposeSubject("");
    setComposeMessage("");
    setComposeSendEmail(Boolean(activeLead.email));
    setComposeSendSms(Boolean(activeLead.phone));
    toast.success("Sent message");
  }

  useEffect(() => {
    if (!activeLead) return;
    setLeadEmailDraft(activeLead.email ?? "");
    setLeadEmailEditorOpen(false);
    setLeadPhoneDraft(activeLead.phone ?? "");
    setLeadPhoneEditorOpen(false);
    setLeadWebsiteDraft(activeLead.website ?? "");
    setLeadWebsiteEditorOpen(false);
    setLeadTagDraft(activeLead.tag ?? "");
    const defaultColor = "#111827";
    setLeadTagColorDraft(isHexColor(activeLead.tagColor || "") ? (activeLead.tagColor as string) : defaultColor);
    setAssignLeadUserIds(
      Array.isArray(activeLead.assignedToUserIds) && activeLead.assignedToUserIds.length
        ? activeLead.assignedToUserIds
        : activeLead.assignedToUserId
          ? [activeLead.assignedToUserId]
          : [],
    );
    setComposeSubject(`Quick question: ${activeLead.businessName}`.slice(0, 120));
    setComposeMessage(
      [
        `Hi ${activeLead.businessName},`,
        "",
        "I came across your business and wanted to reach out.",
        "",
        "Would you be open to a quick conversation?",
      ].join("\n"),
    );
    setComposeSendEmail(Boolean(activeLead.email));
    setComposeSendSms(Boolean(activeLead.phone));
  }, [activeLead]);

  async function saveLeadEmail() {
    if (!activeLead) return;
    const nextEmail = leadEmailDraft.trim();
    const saved = await patchLead(activeLead.id, { email: nextEmail || null });
    if (!saved) return;
    setLeadEmailEditorOpen(false);
  }

  async function saveLeadPhone() {
    if (!activeLead) return;
    const nextPhone = leadPhoneDraft.trim();
    const saved = await patchLead(activeLead.id, { phone: nextPhone || null });
    if (!saved) return;
    setLeadPhoneEditorOpen(false);
  }

  async function saveLeadWebsite() {
    if (!activeLead) return;
    const nextWebsiteRaw = leadWebsiteDraft.trim();
    const nextWebsite = nextWebsiteRaw && !/^https?:\/\//i.test(nextWebsiteRaw) ? `https://${nextWebsiteRaw}` : nextWebsiteRaw;
    const saved = await patchLead(activeLead.id, { website: nextWebsite || null });
    if (!saved) return;
    setLeadWebsiteDraft(nextWebsite);
    setLeadWebsiteEditorOpen(false);
  }

  async function patchLead(
    leadId: string,
    patch: {
      starred?: boolean;
      email?: string | null;
      phone?: string | null;
      website?: string | null;
      tag?: string | null;
      tagColor?: string | null;
      assignedToUserId?: string | null;
    },
  ) {
    setLeadMutating(true);
    setError(null);

    const res = await fetch(`/api/portal/lead-scraping/leads/${leadId}` as any, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify(patch),
    });

    const body = await res.json().catch(() => ({}));
    setLeadMutating(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "That lead did not update. Retry here or review this lead again.");
      return false;
    }

    setLeads((prev) =>
      sortedLeads(
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
                ...(patch.email !== undefined ? { email: patch.email } : {}),
                ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
                ...(patch.website !== undefined ? { website: patch.website } : {}),
                ...(patch.tag !== undefined ? { tag: patch.tag } : {}),
                ...(patch.tagColor !== undefined ? { tagColor: patch.tagColor } : {}),
                ...(patch.assignedToUserId !== undefined ? { assignedToUserId: patch.assignedToUserId } : {}),
              }
            : l,
        ),
      ),
    );
    return true;
  }

  async function deleteLeadForever(leadId: string) {
    setLeadMutating(true);
    setError(null);

    const res = await fetch(`/api/portal/lead-scraping/leads/${leadId}` as any, { method: "DELETE", headers: variantHeaders });
    const body = await res.json().catch(() => ({}));
    setLeadMutating(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "That lead did not delete. Retry here or review the lead list again.");
      return;
    }

    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setSettings((prev) => {
      if (!prev) return prev;
      const nextApproved = { ...prev.outboundState.approvedAtByLeadId };
      const nextSent = { ...prev.outboundState.sentAtByLeadId };
      delete nextApproved[leadId];
      delete nextSent[leadId];
      return {
        ...prev,
        outboundState: { ...prev.outboundState, approvedAtByLeadId: nextApproved, sentAtByLeadId: nextSent },
      };
    });

    setLeadOpen(false);
    toast.success("Deleted");
  }

  async function setLeadContactTagChecked(leadId: string, contactId: string | null | undefined, tagId: string, checked: boolean) {
    if (!contactId) {
      toast.error("This lead does not have a linked contact yet.");
      return;
    }

    const currentLead = leads.find((lead) => lead.id === leadId) ?? null;
    const previousTags = Array.isArray(currentLead?.contactTags) ? currentLead.contactTags : [];
    const knownTag = contactTagDefs.find((tag) => tag.id === tagId) ?? previousTags.find((tag) => tag.id === tagId) ?? null;
    const optimisticTags = checked
      ? previousTags.some((tag) => tag.id === tagId)
        ? previousTags
        : [...previousTags, knownTag ?? { id: tagId, name: "Tag", color: null }]
      : previousTags.filter((tag) => tag.id !== tagId);

    updateLeadContactTags(leadId, optimisticTags);

    setLeadContactTagBusyId(tagId);
    try {
      const res = await fetch(`/api/portal/contacts/${contactId}/tags`, {
        method: checked ? "POST" : "DELETE",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ tagId }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok !== true || !Array.isArray(json?.tags)) {
        throw new Error(String(json?.error || `That tag did not ${checked ? "attach" : "come off"}. Try again here or reopen this lead.`));
      }
      updateLeadContactTags(leadId, normalizeContactTags(json.tags));
    } catch (e: any) {
      updateLeadContactTags(leadId, previousTags);
      toast.error(String(e?.message || "Those tags did not update. Try again here or reopen this lead."));
    } finally {
      setLeadContactTagBusyId(null);
    }
  }

  async function assignLeadToUser() {
    if (!activeLead) return;
    setAssignLeadBusy(true);
    try {
      const nextAssignedToUserIds = Array.from(new Set(assignLeadUserIds.map((value) => String(value || "").trim()).filter(Boolean)));
      const res = await fetch(`/api/portal/lead-scraping/leads/${activeLead.id}` as any, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ assignedToUserIds: nextAssignedToUserIds }),
      });
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        toast.error(getApiError(body) ?? "That lead did not assign. Try again here or keep editing the assignees.");
        return;
      }

      setLeads((prev) =>
        sortedLeads(
          prev.map((lead) =>
            lead.id === activeLead.id
              ? {
                  ...lead,
                  assignedToUserId:
                    typeof body?.assignedToUserId === "string"
                      ? String(body.assignedToUserId)
                      : nextAssignedToUserIds[0] ?? null,
                  assignedToUserIds: Array.isArray(body?.assignedToUserIds)
                    ? body.assignedToUserIds.map((value: unknown) => String(value || "").trim()).filter(Boolean)
                    : nextAssignedToUserIds,
                }
              : lead,
          ),
        ),
      );
      setAssignLeadOpen(false);
      toast.success(nextAssignedToUserIds.length ? "Lead assigned" : "Lead unassigned");
    } finally {
      setAssignLeadBusy(false);
    }
  }

  const hrefForB2bSubTab = useCallback((next: "pull" | "leads" | "settings") => {
    const base = `${portalBasePath}/app/services/lead-scraping`;
    if (next === "pull") return `${base}/scraper`;
    if (next === "settings") return `${base}/settings`;
    return base;
  }, [portalBasePath]);

  const navigateToB2bSubTab = useCallback((next: "pull" | "leads" | "settings") => {
    setTab("b2b");
    setB2bSubTab(next);
    router.push(hrefForB2bSubTab(next));
  }, [hrefForB2bSubTab, router]);

  function openLeadOnMap(leadId: string) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(PENDING_MAP_LEAD_STORAGE_KEY, leadId);
    }
    navigateToB2bSubTab("leads");
  }

  async function addLeadToNewsletter(contactId: string | null | undefined) {
    if (!contactId) {
      toast.error("This lead needs a linked contact first.");
      return;
    }

    const res = await fetch("/api/portal/newsletter/audience/contacts", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ contactIds: [contactId] }),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      toast.error(getApiError(body) ?? "This lead did not add to the newsletter. Try again here or review this lead first.");
      return;
    }
    toast.success(body?.added === 0 ? "Already on the external newsletter list" : "Added to external newsletter list");
  }

  function openPeopleForLead(contactId: string | null | undefined) {
    if (!contactId) {
      toast.error("This lead needs a linked contact first.");
      return;
    }
    router.push(`${portalBasePath}/app/people/contacts?contactId=${encodeURIComponent(contactId)}`, { scroll: false });
  }

  function openNurtureCampaignPicker(contactId: string | null | undefined) {
    if (!contactId) {
      toast.error("This lead needs a linked contact first.");
      return;
    }
    if (!nurtureCampaigns.length) {
      toast.error(nurtureCampaignLoadError || "Create a nurture campaign first.");
      return;
    }
    const firstActiveCampaign = nurtureCampaigns.find((campaign) => String(campaign.status || "") === "ACTIVE");
    setSelectedNurtureCampaignId(firstActiveCampaign?.id ?? "");
    setAddToNurtureOpen(true);
  }

  async function addLeadToNurtureCampaign() {
    if (!activeLead?.contactId) {
      toast.error("This lead needs a linked contact first.");
      return;
    }
    const campaignId = String(selectedNurtureCampaignId || "").trim();
    if (!campaignId) {
      toast.error("Select a nurture campaign.");
      return;
    }

    setAddToNurtureBusy(true);
    try {
      const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(campaignId)}/enroll`, {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ contactIds: [activeLead.contactId] }),
      });
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || body?.ok !== true) {
        toast.error(getApiError(body) ?? "This lead did not join that nurture campaign. Try again here or pick a different campaign.");
        return;
      }

      setAddToNurtureOpen(false);
      toast.success("Added to nurture campaign");
    } finally {
      setAddToNurtureBusy(false);
    }
  }

  async function createLeadContactTag() {
    const name = createContactTagName.trim().slice(0, 60);
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    setCreateContactTagBusy(true);
    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ name, color: createContactTagColor }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok !== true || !json?.tag?.id) {
        throw new Error(String(json?.error || "That tag did not save. Try again here in this panel."));
      }

      const created: ContactTag = {
        id: String(json.tag.id),
        name: String(json.tag.name || name).slice(0, 60),
        color: typeof json.tag.color === "string" ? String(json.tag.color) : null,
      };

      setContactTagDefs((prev) => {
        const next = [...prev.filter((tag) => tag.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });

      setCreateContactTagName("");
      setCreateContactTagColor("#2563EB");
      setCreateContactTagOpen(false);

      if (activeLead?.contactId) {
        await setLeadContactTagChecked(activeLead.id, activeLead.contactId, created.id, true);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "That tag did not save. Try again here in this panel."));
    } finally {
      setCreateContactTagBusy(false);
    }
  }

  function createLeadTagPreset() {
    const label = leadTagDraft.trim().slice(0, 60);
    if (!label) {
      toast.error("Enter a tag name");
      return;
    }
    const color = isHexColor(leadTagColorDraft) ? leadTagColorDraft : "#111827";
    setSettings((prev) => {
      const next = prev ? { ...prev } : ({ version: 3 } as LeadScrapingSettings);
      const current = Array.isArray(next.tagPresets) ? next.tagPresets : [];
      const filtered = current.filter((item) => item.label.trim().toLowerCase() !== label.toLowerCase());
      return { ...next, tagPresets: [...filtered, { label, color }] };
    });
    setLeadTagDraft(label);
    setLeadTagColorDraft(color);
    setCreateLeadTagOpen(false);
  }

  function renderOutboundEditor(opts?: { outerClassName?: string; accent?: "blue" | "pink" | "ink" }) {
    if (!settings) return null;

    const toggleAccent = opts?.accent ?? "blue";

    const aiEnabled = Boolean(settings.outbound.aiDraftAndSend);
    const selectedCampaignId = String(settings.outbound.aiCampaignId ?? "").trim();

    const campaignOptions: Array<PortalListboxOption<string>> = [
      {
        value: "",
        label: aiCampaignsBusy ? "Loading campaigns…" : "Select a campaign…",
        disabled: aiCampaignsBusy,
      },
      ...(aiCampaigns ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.status && c.status !== "ACTIVE" ? c.status.toLowerCase() : undefined,
      })),
    ];

    const attachmentsEditor = (disabled: boolean, channel: "email" | "sms") => {
      const channelResources = getOutboundResourcesForChannel(settings.outbound, channel);

      return (
      <div className={classNames("mb-3 mt-2 flex items-start justify-between gap-3", disabled && "pointer-events-none opacity-60")}>
          <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2">
            {channelResources.length ? (
              channelResources.map((r, idx) => (
                <span
                  key={`${r.url}-${idx}`}
                  className="inline-flex max-w-full items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800"
                >
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-44 truncate hover:text-(--color-brand-blue) hover:underline"
                  >
                    {r.label}
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              outbound: updateOutboundResourcesForChannel(
                                prev.outbound,
                                channel,
                                getOutboundResourcesForChannel(prev.outbound, channel).filter((_, i) => i !== idx),
                              ),
                            }
                          : prev,
                      )
                    }
                    className="text-zinc-400 transition hover:text-zinc-700"
                    aria-label={`Remove ${r.label}`}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : null}
            {outboundUploadBusy ? <span className="text-xs text-zinc-500">Uploading…</span> : null}
          </div>

          <div data-lead-outbound-resources-menu="true" className="relative z-10 shrink-0 self-start">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOutboundResourcesMenuOpen((prev) => (prev === channel ? null : channel))}
              className="relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.16)] text-(--color-brand-blue) shadow-[0_8px_18px_rgba(29,78,216,0.09)] transition hover:bg-[rgba(29,78,216,0.22)] disabled:bg-[rgba(29,78,216,0.08)] disabled:text-[rgba(29,78,216,0.45)]"
              aria-label="Manage outbound resources"
            >
              <IconServiceGlyph slug="media-library" />
            </button>

            {outboundResourcesMenuOpen === channel ? (
              <LiquidGlassPopupSurface data-lead-outbound-resources-menu="true" className="absolute bottom-12 right-0 z-30 flex min-w-48 flex-col gap-1 rounded-2xl p-2 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
                <label className="inline-flex cursor-pointer items-center rounded-2xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition hover:bg-white/16">
                  <input
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadOutboundFile(channel, f);
                      e.currentTarget.value = "";
                      setOutboundResourcesMenuOpen(null);
                    }}
                    disabled={outboundUploadBusy}
                    className="hidden"
                  />
                  Upload
                </label>
                <button
                  type="button"
                  disabled={outboundUploadBusy}
                  onClick={() => {
                    setOutboundResourcesMenuOpen(null);
                    setOutboundResourcesPickerChannel(channel);
                    setOutboundResourcesPickerOpen(true);
                  }}
                  className="rounded-2xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition hover:bg-white/16 disabled:opacity-60"
                >
                  Media Library
                </button>
              </LiquidGlassPopupSurface>
            ) : null}
          </div>
      </div>
      );
    };

    const sparkleIcon = (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2l1.2 4.2L17 7.4l-3.8 1.2L12 13l-1.2-4.4L7 7.4l3.8-1.2L12 2zm7 7l.8 2.8 2.2.7-2.2.7L19 16l-.8-2.8-2.2-.7 2.2-.7L19 9zm-14 3l.8 2.8 2.2.7-2.2.7L5 19l-.8-2.8-2.2-.7 2.2-.7L5 12z" />
      </svg>
    );

    return (
      <div>
        <PortalVariablePickerModal
          open={outboundVarPickerOpen}
          variables={leadOutboundTemplateVariables}
          title="Insert variable"
          createCustom={{
            enabled: true,
            existingKeys: leadOutboundExistingKeys,
            onCreate: async (key, value) => {
              const res = await fetch("/api/portal/follow-up/custom-variables", {
                method: "PUT",
                headers: { "content-type": "application/json", ...variantHeaders },
                body: JSON.stringify({ key, value }),
              });
              const body = (await res.json().catch(() => ({}))) as any;
              if (!res.ok || body?.ok !== true) {
                throw new Error(getApiError(body) ?? "That variable did not save. Try again here or keep using the current variables.");
              }
              const raw =
                body.customVariables && typeof body.customVariables === "object" && !Array.isArray(body.customVariables)
                  ? (body.customVariables as Record<string, unknown>)
                  : {};
              const normalized = Object.fromEntries(
                Object.entries(raw)
                  .filter(([k, v]) => typeof k === "string" && typeof v === "string")
                  .map(([k, v]) => [k.trim(), String(v)])
                  .filter(([k]) => Boolean(k))
                  .slice(0, 60),
              ) as Record<string, string>;
              setTemplateCustomVariables(normalized);
            },
          }}
          onPick={applyOutboundVariable}
          onClose={() => {
            setOutboundVarPickerOpen(false);
            setOutboundVarTarget(null);
          }}
        />

        <AppModal
          open={Boolean(outboundAiDraftModal)}
          title="AI draft"
          description="Describe what you want this template to say."
          onClose={() => {
            if (outboundAiDraftBusy) return;
            setOutboundAiDraftModal(null);
            setOutboundAiDraftError(null);
          }}
          widthClassName="w-[min(640px,calc(100vw-32px))]"
          footer={
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-2xl bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(236,72,153,0.95))] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(29,78,216,0.18)] hover:opacity-95 disabled:opacity-60"
                disabled={outboundAiDraftBusy || !outboundAiDraftModal}
                onClick={async () => {
                  if (!outboundAiDraftModal) return;
                  setOutboundAiDraftBusy(true);
                  setOutboundAiDraftError(null);
                  try {
                    const draft = await generateOutboundTemplateDraft({
                      kind: outboundAiDraftModal.kind,
                      prompt: outboundAiDraftInstruction.trim() || undefined,
                      existingSubject: outboundAiDraftModal.kind === "EMAIL" ? outboundAiDraftModal.existingSubject : undefined,
                      existingBody: outboundAiDraftModal.existingBody,
                    });
                    if (!draft) return;
                    outboundAiDraftModal.apply(draft);
                    setOutboundAiDraftModal(null);
                    setOutboundAiDraftInstruction("");
                  } catch (e: any) {
                      setOutboundAiDraftError(String(e?.message || "That outbound draft did not generate. Retry here or keep editing the instructions."));
                  } finally {
                    setOutboundAiDraftBusy(false);
                  }
                }}
              >
                {outboundAiDraftBusy ? "Drafting…" : "Generate"}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <label className="block">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-zinc-600">Instructions</div>
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  disabled={outboundAiDraftBusy}
                  onClick={() => openOutboundVarPicker("aiDraftInstruction")}
                >
                  Insert variable
                </button>
              </div>
              <textarea
                ref={outboundAiDraftInstructionRef}
                className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                value={outboundAiDraftInstruction}
                onChange={(e) => setOutboundAiDraftInstruction(e.target.value)}
                onFocus={(e) => {
                  outboundActiveFieldElRef.current = e.currentTarget;
                }}
                disabled={outboundAiDraftBusy}
                placeholder="e.g. Friendly, short, and ask them to reply with any questions."
              />
            </label>

            {outboundAiDraftError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {outboundAiDraftError}
              </div>
            ) : null}

            <div className="text-xs text-zinc-500">Tip: you can reference variables like {"{businessName}"} and {"{website}"}.</div>
          </div>
        </AppModal>

        <AppModal
          open={Boolean(deleteForeverLeadId)}
          title="Delete lead forever?"
          description="This cannot be undone."
          onClose={() => {
            if (leadMutating) return;
            setDeleteForeverLeadId(null);
          }}
          widthClassName="w-[min(560px,calc(100vw-32px))]"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                disabled={leadMutating}
                onClick={() => setDeleteForeverLeadId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                disabled={leadMutating || !deleteForeverLeadId}
                onClick={async () => {
                  const id = deleteForeverLeadId;
                  if (!id) return;
                  setDeleteForeverLeadId(null);
                  await deleteLeadForever(id);
                }}
              >
                Delete forever
              </button>
            </div>
          }
        >
          <div className="text-sm text-zinc-700">
            This will permanently remove the lead from your account.
          </div>
        </AppModal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {aiCallsUnlocked || leadOutboundEntitled ? (
            <div className="rounded-2xl border border-zinc-200 bg-[linear-gradient(90deg,rgba(29,78,216,0.12),rgba(236,72,153,0.12),rgba(255,255,255,0.92))] p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <span className="text-(--color-brand-pink)">{sparkleIcon}</span>
                    AI outbound agent
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    When enabled, your AI outbound agent will automatically reach out to these leads.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-zinc-700">On</div>
                  <ToggleSwitch
                    checked={aiEnabled}
                    accent={toggleAccent}
                    onChange={(checked) =>
                      {
                        if (checked && aiCampaigns === null && !aiCampaignsBusy) {
                          void loadAiCampaigns();
                        }
                        setSettings((prev) => {
                          if (!prev) return prev;
                          const existingCalls = prev.outbound.calls ?? { enabled: false, trigger: "MANUAL" as const };
                          const defaultCampaignId =
                            checked && !String(prev.outbound.aiCampaignId ?? "").trim() && aiCampaigns?.length
                              ? String(aiCampaigns[0]?.id || "")
                              : String(prev.outbound.aiCampaignId ?? "");

                          return {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              enabled: checked ? true : prev.outbound.enabled,
                              aiDraftAndSend: checked,
                              aiCampaignId: defaultCampaignId || null,
                              calls: { ...existingCalls, enabled: checked },
                            },
                          };
                        });
                      }
                    }
                  />
                </div>
              </div>

              {aiEnabled ? (
                <div className="mt-4">
                  <label className="block">
                    <div className="text-xs font-semibold text-zinc-700">Campaign</div>
                    <div className="mt-2">
                      <PortalListboxDropdown
                        value={selectedCampaignId}
                        options={campaignOptions}
                        disabled={aiCampaignsBusy}
                        placeholder="Select a campaign…"
                        buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50"
                        onChange={(v) =>
                          setSettings((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  outbound: {
                                    ...prev.outbound,
                                    aiCampaignId: v ? v : null,
                                  },
                                }
                              : prev,
                          )
                        }
                      />
                    </div>

                    {!aiCampaignsBusy && aiCampaigns && aiCampaigns.length === 0 ? (
                      <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
                        <div className="font-semibold text-zinc-900">No campaigns found</div>
                        <div className="mt-1">Create an AI outbound campaign first, then come back here to attach lead scraping runs to it.</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => router.push(`${portalBasePath}/app/services/ai-outbound-calls`, { scroll: false })}
                          >
                            Open AI outbound
                          </button>
                          <button
                            type="button"
                            className="rounded-2xl bg-(--color-brand-blue) px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
                            onClick={() => router.push(`${portalBasePath}/app/ai-chat?onboarding=1`, { scroll: false })}
                          >
                            Ask Pura for help
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </label>
                </div>
              ) : null}
            </div>
          ) : leadOutboundGateReady ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2">
              <div className="text-sm font-semibold text-zinc-900">AI outbound agent</div>
              <div className="mt-1 text-xs text-zinc-600">
                This requires the AI outbound calls service to be enabled on your account.
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2">
              <div className="text-sm font-semibold text-zinc-900">AI outbound agent</div>
              <div className="mt-1 text-xs text-zinc-600">
                Checking your outbound AI access and available campaigns…
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Email</div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-zinc-700">On</div>
                <ToggleSwitch
                  checked={settings.outbound.email.enabled}
                  accent={toggleAccent}
                  onChange={(checked) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              enabled: checked ? true : prev.outbound.enabled,
                              email: { ...prev.outbound.email, enabled: checked },
                            },
                          }
                        : prev,
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className={!settings.outbound.email.enabled ? "pointer-events-none opacity-60" : ""}>
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-600">Trigger</div>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={settings.outbound.email.trigger}
                      options={OUTBOUND_TRIGGER_OPTIONS}
                      onChange={(v) =>
                        setSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                outbound: {
                                  ...prev.outbound,
                                  email: { ...prev.outbound.email, trigger: v },
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(236,72,153,0.95))] px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-95"
                    onClick={() => {
                      if (!settings) return;
                      setOutboundAiDraftError(null);
                      setOutboundAiDraftModal({
                        kind: "EMAIL",
                        existingSubject: settings.outbound.email.subject,
                        existingBody: settings.outbound.email.text,
                        apply: (draft) => {
                          setSettings((prev) => {
                            if (!prev) return prev;
                            const subject = (draft.subject ?? prev.outbound.email.subject ?? "").trim().slice(0, 120);
                            const body = String(draft.body || "");
                            return {
                              ...prev,
                              outbound: {
                                ...prev.outbound,
                                email: {
                                  ...prev.outbound.email,
                                  subject: subject || "Quick question",
                                  text: body,
                                },
                              },
                            };
                          });
                        },
                      });
                    }}
                  >
                    <span className="text-white">{sparkleIcon}</span>
                    <span>AI draft</span>
                  </button>
                </div>

                <label className="block">
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-600">Subject</div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => openOutboundVarPicker("emailSubject")}
                    >
                      Insert variable
                    </button>
                  </div>
                  <input
                    ref={outboundEmailSubjectRef}
                    className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    value={settings.outbound.email.subject}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              outbound: { ...prev.outbound, email: { ...prev.outbound.email, subject: e.target.value } },
                            }
                          : prev,
                      )
                    }
                    onFocus={(e) => {
                      outboundActiveFieldElRef.current = e.currentTarget;
                    }}
                    autoComplete="off"
                  />
                </label>

                <label className="block">
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-600">Message</div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => openOutboundVarPicker("emailMessage")}
                    >
                      Insert variable
                    </button>
                  </div>
                  <textarea
                    ref={outboundEmailMessageRef}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    rows={6}
                    value={settings.outbound.email.text}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              outbound: { ...prev.outbound, email: { ...prev.outbound.email, text: e.target.value } },
                            }
                          : prev,
                      )
                    }
                    onFocus={(e) => {
                      outboundActiveFieldElRef.current = e.currentTarget;
                    }}
                  />
                </label>

              </div>

              {attachmentsEditor(false, "email")}

              <div className="text-xs text-zinc-500">
                Email only sends to leads that have an email address. A copy is sent to your profile email.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">SMS</div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-zinc-700">On</div>
                <ToggleSwitch
                  checked={settings.outbound.sms.enabled}
                  accent={toggleAccent}
                  onChange={(checked) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              enabled: checked ? true : prev.outbound.enabled,
                              sms: { ...prev.outbound.sms, enabled: checked },
                            },
                          }
                        : prev,
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className={!settings.outbound.sms.enabled ? "pointer-events-none opacity-60" : ""}>
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-600">Trigger</div>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={settings.outbound.sms.trigger}
                      options={OUTBOUND_TRIGGER_OPTIONS}
                      onChange={(v) =>
                        setSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                outbound: {
                                  ...prev.outbound,
                                  sms: { ...prev.outbound.sms, trigger: v },
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(236,72,153,0.95))] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                    onClick={() => {
                      if (!settings) return;
                      setOutboundAiDraftError(null);
                      setOutboundAiDraftModal({
                        kind: "SMS",
                        existingBody: settings.outbound.sms.text,
                        apply: (draft) => {
                          setSettings((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              outbound: {
                                ...prev.outbound,
                                sms: {
                                  ...prev.outbound.sms,
                                  text: String(draft.body || "").slice(0, 900),
                                },
                              },
                            };
                          });
                        },
                      });
                    }}
                  >
                    <span className="text-white">{sparkleIcon}</span>
                    <span>AI draft</span>
                  </button>
                </div>

                <label className="block">
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-600">Message</div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => openOutboundVarPicker("smsMessage")}
                    >
                      Insert variable
                    </button>
                  </div>
                  <textarea
                    ref={outboundSmsMessageRef}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    rows={6}
                    value={settings.outbound.sms.text}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              outbound: { ...prev.outbound, sms: { ...prev.outbound.sms, text: e.target.value } },
                            }
                          : prev,
                      )
                    }
                    onFocus={(e) => {
                      outboundActiveFieldElRef.current = e.currentTarget;
                    }}
                  />
                </label>

              </div>

              {attachmentsEditor(false, "sms")}

              <div className="text-xs text-zinc-500">Texts only send when the lead has a phone number.</div>
            </div>
          </div>
        </div>

        <PortalMediaPickerModal
          open={outboundResourcesPickerOpen}
          title={outboundResourcesPickerChannel === "sms" ? "Attach a text resource" : "Attach an email resource"}
          confirmLabel="Attach"
          onClose={() => {
            setOutboundResourcesPickerOpen(false);
            setOutboundResourcesPickerChannel(null);
          }}
          onPick={(item) => {
            const channel = outboundResourcesPickerChannel ?? "email";
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    outbound: updateOutboundResourcesForChannel(prev.outbound, channel, [
                      { label: item.fileName.slice(0, 120), url: item.shareUrl },
                      ...getOutboundResourcesForChannel(prev.outbound, channel),
                    ]),
                  }
                : prev,
            );
            setOutboundResourcesMenuOpen(null);
            setOutboundResourcesPickerOpen(false);
            setOutboundResourcesPickerChannel(null);
          }}
        />
      </div>
    );
  }

  const setSidebarOverride = useSetPortalSidebarOverride();
  const leadScrapingSidebar = useMemo(() => {
    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>Lead Scraping</div>
          <div className={portalSidebarSectionStackClass}>
            <PortalSidebarNavButton
              type="button"
              onClick={() => navigateToB2bSubTab(b2bSubTab)}
              aria-current={tab === "b2b" ? "page" : undefined}
              label="B2B"
              icon={<IconBusinessGlyph size={18} />}
              iconToneClassName={portalSidebarIconToneClassForSlug("lead-scraping")}
              className={
                `${portalSidebarBorderButtonBaseClass} ` +
                (tab === "b2b" ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass)
              }
            >
              B2B
            </PortalSidebarNavButton>
            <PortalSidebarNavButton
              type="button"
              onClick={() => setTab("b2c")}
              aria-current={tab === "b2c" ? "page" : undefined}
              label="B2C"
              icon={<IconPeopleGlyph size={18} />}
              iconToneClassName={portalSidebarIconTonePinkClass}
              className={
                `${portalSidebarBorderButtonBaseClass} ` +
                (tab === "b2c" ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass)
              }
            >
              B2C
            </PortalSidebarNavButton>
          </div>
        </div>

        {tab === "b2b" ? (
          <div>
            <div className={portalSidebarSectionTitleClass}>B2B View</div>
            <div className={portalSidebarSectionStackClass}>
              {([
                { key: "leads", label: "Leads" },
                { key: "pull", label: "Scraper" },
                { key: "settings", label: "Settings" },
              ] as const).map((item) => (
                <PortalSidebarNavButton
                  key={item.key}
                  type="button"
                  onClick={() => navigateToB2bSubTab(item.key)}
                  aria-current={b2bSubTab === item.key ? "page" : undefined}
                  label={item.label}
                  icon={item.key === "leads" ? <IconPeopleGlyph size={18} /> : item.key === "pull" ? <IconFunnel size={18} /> : <IconSidebarSettings />}
                  iconToneClassName={item.key === "settings" ? portalSidebarIconToneNeutralClass : portalSidebarIconToneClassForSlug("lead-scraping")}
                  className={
                    `${portalSidebarBorderButtonBaseClass} ` +
                    (b2bSubTab === item.key ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass)
                  }
                >
                  {item.label}
                </PortalSidebarNavButton>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    );
  }, [b2bSubTab, navigateToB2bSubTab, tab]);

  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: leadScrapingSidebar,
      mobileSidebarContent: leadScrapingSidebar,
    });
  }, [leadScrapingSidebar, setSidebarOverride]);

  useEffect(() => {
    return () => setSidebarOverride(null);
  }, [setSidebarOverride]);

  const initialScreenMode: "pull" | "leads" | "settings" = tab === "b2b" ? activeB2bSubTab : "leads";
  const initialScreenErrorMessage = error ?? getLeadScrapingLoadErrorMessage(initialScreenMode);

  if (loading && !hasLoadedOnceRef.current) {
    return <LeadScrapingLoadingShell mode={initialScreenMode} />;
  }

  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
          <div className="font-semibold">Lead Scraping needs attention</div>
          <div className="mt-2 text-red-800">{initialScreenErrorMessage}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Retry
            </button>
            <Link
              href={`${portalBasePath}/app/services/lead-scraping/settings`}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Open settings
            </Link>
            <Link
              href={`${portalBasePath}/app/ai-chat?onboarding=1`}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Ask Pura
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const showInlineLeadDetail = isLeadMapLayout && leadOpen && Boolean(activeLead);
  const isScraperLayout = tab === "b2b" && activeB2bSubTab === "pull";
  const isSettingsLayout = tab === "b2b" && activeB2bSubTab === "settings";
  const isConsumerLeadsLayout = tab === "b2c";
  const showComposeSubject = composeSendEmail;
  const canSendLeadMessage = Boolean(!composeBusy && (composeSendEmail || composeSendSms) && composeMessage.trim().length);
  const saveControl = saving ? (
    <button
      type="button"
      disabled
      className="inline-flex items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.14)] px-5 py-2.5 text-sm font-semibold text-(--color-brand-blue)"
    >
      Saving…
    </button>
  ) : isDirty ? (
    <button
      type="button"
      onClick={save}
      className="inline-flex items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.16)] px-5 py-2.5 text-sm font-semibold text-(--color-brand-blue) transition hover:bg-[rgba(29,78,216,0.22)]"
    >
      Save
    </button>
  ) : (
    <div className="inline-flex items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.08)] px-5 py-2.5 text-sm font-semibold text-[rgba(29,78,216,0.65)]">
      Saved
    </div>
  );
  const savedExclusionSections: Array<{
    kind: ExclusionKind;
    label: string;
    description: string;
    placeholder: string;
    values: string[];
    busy: boolean;
  }> = [
    {
      kind: "name",
      label: "Business names",
      description: "Exclude specific business names from future pulls.",
      placeholder: "e.g. walmart",
      values: settings.b2b.excludeNameContains ?? [],
      busy: excludeCsvBusy.name,
    },
    {
      kind: "domain",
      label: "Domains",
      description: "Exclude specific website domains from future pulls.",
      placeholder: "e.g. facebook.com",
      values: settings.b2b.excludeDomains ?? [],
      busy: excludeCsvBusy.domain,
    },
    {
      kind: "phone",
      label: "Phone numbers",
      description: "Exclude specific phone numbers from future pulls.",
      placeholder: "e.g. +15551234567",
      values: settings.b2b.excludePhones ?? [],
      busy: excludeCsvBusy.phone,
    },
    {
      kind: "address",
      label: "Addresses",
      description: "Exclude specific addresses from future pulls.",
      placeholder: "e.g. 123 main st",
      values: settings.b2b.excludeAddresses ?? [],
      busy: excludeCsvBusy.address,
    },
  ];
  const exclusionSections = savedExclusionSections.map((section) => ({
    ...section,
    values: exclusionDraftLists[section.kind],
  }));
  const activeExclusionSection = exclusionsModalKind
    ? (exclusionSections.find((section) => section.kind === exclusionsModalKind) ?? null)
    : null;
  const activeExclusionDraft = !exclusionsModalKind
    ? ""
    : exclusionsModalKind === "name"
      ? excludeNameDraft
      : exclusionsModalKind === "domain"
        ? excludeDomainDraft
        : exclusionsModalKind === "phone"
          ? excludePhoneDraft
          : excludeAddressDraft;
  const leadDetailBody = activeLead ? (
    <>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={closeLead}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.12)] text-brand-blue transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(29,78,216,0.18)] focus-visible:outline-none"
          aria-label="Back to leads"
        >
          <span className="text-lg leading-none">←</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDeleteForeverLeadId(activeLead.id);
          }}
          disabled={leadMutating}
          className="inline-flex items-center justify-center rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-60"
        >
          Delete Lead
        </button>
      </div>

      <div className="mt-3">
        <div className="text-lg font-semibold text-brand-ink">{activeLead.businessName}</div>
        <div className="mt-1 text-xs text-zinc-500">Pulled: {safeFormatDateTime(activeLead.createdAtIso)}</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={classNames("rounded-2xl p-4", portalGlassSectionClass)}>
          <div className="text-xs font-semibold text-zinc-600">Phone</div>
          {activeLead.phone && !leadPhoneEditorOpen ? (
            <div className="mt-1 text-sm text-zinc-900">{activeLead.phone}</div>
          ) : leadPhoneEditorOpen ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={leadPhoneDraft}
                onChange={(e) => setLeadPhoneDraft(e.target.value)}
                placeholder="Add phone to enable SMS sends"
                className={classNames("w-full rounded-xl px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500", portalGlassButtonClass)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void saveLeadPhone()}
                disabled={leadMutating || !leadPhoneDraft.trim()}
                className="shrink-0 rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-sm font-semibold text-brand-blue shadow-[0_12px_24px_rgba(29,78,216,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setLeadPhoneEditorOpen(true)}
                disabled={leadMutating}
                className="inline-flex items-center gap-2 rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-sm font-semibold text-brand-blue shadow-[0_12px_24px_rgba(29,78,216,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60"
              >
                <span className="text-base leading-none">+</span>
                <span>Add</span>
              </button>
            </div>
          )}
        </div>
        <div className={classNames("rounded-2xl p-4", portalGlassSectionClass)}>
          <div className="text-xs font-semibold text-zinc-600">Email</div>
          {activeLead.email && !leadEmailEditorOpen ? (
            <div className="mt-1 text-sm text-zinc-900">{activeLead.email}</div>
          ) : leadEmailEditorOpen ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={leadEmailDraft}
                onChange={(e) => setLeadEmailDraft(e.target.value)}
                placeholder="Add email to enable email sends"
                className={classNames("w-full rounded-xl px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500", portalGlassButtonClass)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void saveLeadEmail()}
                disabled={leadMutating || !leadEmailDraft.trim()}
                className="shrink-0 rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-sm font-semibold text-brand-blue shadow-[0_12px_24px_rgba(29,78,216,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setLeadEmailEditorOpen(true)}
                disabled={leadMutating}
                className="inline-flex items-center gap-2 rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-sm font-semibold text-brand-blue shadow-[0_12px_24px_rgba(29,78,216,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60"
              >
                <span className="text-base leading-none">+</span>
                <span>Add</span>
              </button>
            </div>
          )}
        </div>
        <div className={classNames("rounded-2xl p-4", portalGlassSectionClass)}>
          <div className="text-xs font-semibold text-zinc-600">Website</div>
          {activeLead.website && !leadWebsiteEditorOpen ? (
            <div className="mt-1 wrap-break-word text-sm text-zinc-900">
              <a
                href={activeLead.website}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-(--color-brand-blue) hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {activeLead.website}
              </a>
            </div>
          ) : leadWebsiteEditorOpen ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={leadWebsiteDraft}
                onChange={(e) => setLeadWebsiteDraft(e.target.value)}
                placeholder="Add website"
                className={classNames("w-full rounded-xl px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500", portalGlassButtonClass)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void saveLeadWebsite()}
                disabled={leadMutating || !leadWebsiteDraft.trim()}
                className="shrink-0 rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-sm font-semibold text-brand-blue shadow-[0_12px_24px_rgba(29,78,216,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setLeadWebsiteEditorOpen(true)}
                disabled={leadMutating}
                className="inline-flex items-center gap-2 rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-sm font-semibold text-brand-blue shadow-[0_12px_24px_rgba(29,78,216,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60"
              >
                <span className="text-base leading-none">+</span>
                <span>Add</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={classNames("rounded-2xl p-4", portalGlassSectionClass)}>
          <div className="text-xs font-semibold text-zinc-600">Tags</div>
          <div className="mt-3 flex flex-wrap gap-2 overflow-hidden">
            {activeLead.contactTags?.length ? (
              activeLead.contactTags.map((tag) => {
                const color = isHexColor(tag.color || "") ? String(tag.color) : null;
                const pillStyle = leadContactTagChipStyle(color);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    disabled={leadContactTagBusyId === tag.id}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-90 disabled:opacity-60"
                    style={pillStyle}
                    title="Remove tag"
                    onClick={() => void setLeadContactTagChecked(activeLead.id, activeLead.contactId, tag.id, false)}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color || "#e4e4e7" }} />
                    <span className="max-w-52 truncate">{tag.name}</span>
                    <span className="opacity-60">×</span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-3 text-sm text-zinc-600">
                <div className="font-semibold text-zinc-900">Create the first lead tag</div>
                <div className="mt-1">Create one here so this lead can be segmented for follow-up, nurture, or exports.</div>
                <button
                  type="button"
                  className={classNames("mt-3 rounded-xl px-3 py-2 text-xs font-semibold", portalGlassButtonClass)}
                  onClick={() => setCreateContactTagOpen(true)}
                >
                  Create tag
                </button>
              </div>
            )}
          </div>
          <div className="mt-4">
            <PortalSelectDropdown<string>
              value={""}
              onChange={(tagId) => {
                if (!tagId) return;
                if (tagId === "__new_tag__") {
                  setCreateContactTagOpen(true);
                  return;
                }
                void setLeadContactTagChecked(activeLead.id, activeLead.contactId, tagId, true);
              }}
              disabled={!activeLead.contactId}
              options={[
                { value: "", label: activeLead.contactId ? "Select a tag…" : "Contact link required", disabled: true },
                ...contactTagDefs
                  .filter((tag) => !(activeLead.contactTags ?? []).some((current) => current.id === tag.id))
                  .map((tag) => ({ value: tag.id, label: tag.name })),
                { value: "__new_tag__", label: "New tag…" },
              ]}
              className="w-full"
              buttonClassName={classNames("flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm outline-none hover:bg-white/80", portalGlassButtonClass)}
            />
          </div>
        </div>

        <div className={classNames("rounded-2xl p-4", portalGlassSectionClass)}>
          <div className="text-xs font-semibold text-zinc-600">Actions</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeLead.phone ? (
              <a
                href={toTelHref(activeLead.phone)}
                className={leadActionGreenSoftClass}
                onClick={(e) => e.stopPropagation()}
              >
                <IconPhoneCall size={16} className="shrink-0" />
                Call
              </a>
            ) : (
              <button
                type="button"
                disabled
                className={leadActionGreenSoftClass}
              >
                <IconPhoneCall size={16} className="shrink-0" />
                Call
              </button>
            )}
            <button
              type="button"
              onClick={() => setAssignLeadOpen(true)}
              disabled={leadMutating}
              className={leadActionBlueSoftClass}
            >
              <LeadActionServiceIcon slug="tasks" />
              Assign
            </button>
            <button
              type="button"
              onClick={() => openNurtureCampaignPicker(activeLead.contactId)}
              className={classNames(leadActionAmberSoftClass, "gap-2 whitespace-nowrap")}
            >
              <LeadActionServiceIcon slug="nurture-campaigns" />
              Add to nurture campaign
            </button>
            <button
              type="button"
              onClick={() => void addLeadToNewsletter(activeLead.contactId)}
              className={leadActionRoseSoftClass}
            >
              <LeadActionServiceIcon slug="newsletter" />
              Add to newsletter
            </button>
            <button
              type="button"
              onClick={() => openPeopleForLead(activeLead.contactId)}
              className={leadActionVioletSoftClass}
            >
              <IconPeopleGlyph size={16} className="shrink-0" />
              Open in people
            </button>
            {leadOutboundEntitled && settings.outbound.enabled ? (
              <button
                type="button"
                onClick={() => setLeadApproved(activeLead.id, !Boolean(activeLeadApprovedAt))}
                disabled={outboundBusy}
                className={classNames("inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-white/80 disabled:opacity-60", portalGlassButtonClass)}
              >
                {activeLeadApprovedAt ? "Unapprove" : "Approve"}
              </button>
            ) : null}
            {leadOutboundEntitled && settings.outbound.enabled ? (
              <button
                type="button"
                onClick={() => sendDefaultOutbound(activeLead.id)}
                disabled={outboundBusy}
                className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {outboundBusy ? "Working…" : "Send default"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm text-zinc-700">
          {activeLead.address ? <div className="truncate sm:whitespace-normal">{activeLead.address}</div> : <div className="text-zinc-500">Address still syncing for this lead.</div>}
          {activeLead.synopsis ? <div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{activeLead.synopsis}</div> : null}
          {activeLead.contactPerson || activeLead.alternateEmails?.length || activeLead.secondaryPhones?.length || activeLead.businessFacts?.length ? (
            <div className="mt-3 space-y-1 text-xs text-zinc-500">
              {activeLead.contactPerson ? <div>Contact person: {activeLead.contactPerson}</div> : null}
              {activeLead.alternateEmails?.length ? <div>Extra emails: {activeLead.alternateEmails.join(", ")}</div> : null}
              {activeLead.secondaryPhones?.length ? <div>Extra phones: {activeLead.secondaryPhones.join(", ")}</div> : null}
              {activeLead.isChain === true ? <div>Business type: Chain or multi-location brand</div> : null}
              {activeLead.isChain === false ? <div>Business type: Independent location</div> : null}
              {activeLead.businessFacts?.slice(0, 3).map((fact) => <div key={fact}>{fact}</div>)}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-start sm:justify-end">
          <button
            type="button"
            onClick={() => downloadText(`leads_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(leads))}
            className={leadActionExportClass}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 sm:hidden">
        <AppModal
          open={createLeadTagOpen}
          title="Create new tag"
          description="Create a lead tag and then assign it from the dropdown."
          onClose={() => setCreateLeadTagOpen(false)}
          widthClassName="w-[min(540px,calc(100vw-32px))]"
          closeVariant="x"
          footer={
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                onClick={createLeadTagPreset}
              >
                Create
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3">
            <input
              value={leadTagDraft}
              onChange={(e) => setLeadTagDraft(e.target.value)}
              placeholder="Tag name"
              className="w-full rounded-xl bg-white/80 px-3 py-2 text-sm outline-none"
              autoComplete="off"
            />
            <div>
              <div className="text-xs font-medium text-zinc-700">Color</div>
              <div className="mt-2 rounded-2xl bg-white/45 px-3 py-3">
                <ColorSwatches value={leadTagColorDraft} onChange={setLeadTagColorDraft} />
              </div>
            </div>
          </div>
        </AppModal>
        <button
          type="button"
          onClick={() => setLeadIndex((i) => Math.max(0, i - 1))}
          disabled={leadIndex <= 0}
          className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-50"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => setLeadIndex((i) => Math.min(leads.length - 1, i + 1))}
          disabled={leadIndex >= leads.length - 1}
          className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <div className={classNames("mt-5 rounded-2xl p-4", portalGlassSectionClass)}>
        <div className="mb-3 text-sm font-semibold text-zinc-900">Email / SMS</div>
          <PortalVariablePickerModal
            open={composeVarPickerOpen}
            variables={leadOutboundTemplateVariables}
            createCustom={{
              enabled: true,
              existingKeys: leadOutboundExistingKeys,
              onCreate: async (key, value) => {
                const res = await fetch("/api/portal/follow-up/custom-variables", {
                  method: "PUT",
                  headers: { "content-type": "application/json", ...variantHeaders },
                  body: JSON.stringify({ key, value }),
                });
                const body = (await res.json().catch(() => ({}))) as any;
                if (!res.ok || body?.ok !== true) {
                  throw new Error(getApiError(body) ?? "That variable did not save. Try again here or keep using the current variables.");
                }
                const raw =
                  body.customVariables && typeof body.customVariables === "object" && !Array.isArray(body.customVariables)
                    ? (body.customVariables as Record<string, unknown>)
                    : {};
                const normalized = Object.fromEntries(
                  Object.entries(raw)
                    .filter(([k, v]) => typeof k === "string" && typeof v === "string")
                    .map(([k, v]) => [k.trim(), String(v)])
                    .filter(([k]) => Boolean(k))
                    .slice(0, 60),
                ) as Record<string, string>;
                setTemplateCustomVariables(normalized);
              },
            }}
            onPick={applyComposeVariable}
            onClose={() => {
              setComposeVarPickerOpen(false);
              setComposeVarTarget(null);
            }}
          />

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
              <div className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <span className="font-semibold">Email</span>
                <ToggleSwitch
                  checked={composeSendEmail}
                  onChange={setComposeSendEmail}
                  disabled={!activeLead.email}
                  accent="blue"
                />
              </div>
              <div className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <span className="font-semibold">SMS</span>
                <ToggleSwitch
                  checked={composeSendSms}
                  onChange={setComposeSendSms}
                  disabled={!activeLead.phone}
                  accent="blue"
                />
              </div>
              {!activeLead.phone ? <span className="text-xs text-zinc-500">No phone on this lead</span> : null}
              {!activeLead.email ? <span className="text-xs text-zinc-500">No email on this lead</span> : null}
            </div>

            {showComposeSubject ? (
              <label className="block sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600">Subject (email)</div>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => openComposeVarPicker("subject")}
                  >
                    Insert variable
                  </button>
                </div>
                <input
                  ref={composeSubjectRef}
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  disabled={!composeSendEmail}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                  autoComplete="off"
                />
              </label>
            ) : null}
            <label className="block sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-zinc-600">Message</div>
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={() => openComposeVarPicker("message")}
                >
                  Insert variable
                </button>
              </div>
              <textarea
                ref={composeMessageRef}
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={sendLeadMessage}
              disabled={!canSendLeadMessage}
              className={leadComposeSendButtonClass}
              aria-label={composeBusy ? "Sending" : "Send"}
              title={composeBusy ? "Sending" : "Send"}
            >
              <span className="group-hover:hidden">
                <IconSend />
              </span>
              <span className="hidden group-hover:inline">
                <IconSendHover />
              </span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {activeLeadApprovedAt ? <span className="whitespace-nowrap">Approved: {safeFormatDateTime(activeLeadApprovedAt)}</span> : null}
            {activeLeadSentAt ? <span className="whitespace-nowrap">Sent: {safeFormatDateTime(activeLeadSentAt)}</span> : null}
            <span className="whitespace-nowrap">
              {leadIndex + 1} / {leads.length}
            </span>
          </div>
      </div>

      <AppModal
        open={createContactTagOpen}
        title="Create new tag"
        description="Pick a name and color, then add it to this lead's contact."
        onClose={() => {
          if (createContactTagBusy) return;
          setCreateContactTagOpen(false);
          setCreateContactTagName("");
          setCreateContactTagColor("#2563EB");
        }}
        widthClassName="w-[min(540px,calc(100vw-32px))]"
        closeVariant="x"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={createContactTagBusy}
              onClick={() => void createLeadContactTag()}
            >
              {createContactTagBusy ? "Creating…" : "Create"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <input
            className="w-full rounded-xl bg-white/80 px-3 py-2 text-sm outline-none"
            placeholder="Tag name"
            value={createContactTagName}
            onChange={(e) => setCreateContactTagName(e.target.value)}
            autoFocus
          />
          <div>
            <div className="text-xs font-medium text-zinc-700">Color</div>
            <div className="mt-2 rounded-2xl bg-white/45 px-3 py-3">
              <ColorSwatches value={createContactTagColor} onChange={setCreateContactTagColor} />
            </div>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={assignLeadOpen}
        title="Assign lead"
        description="Choose one or more portal users or admins to own this lead. We will notify them and create follow-up tasks automatically."
        onClose={() => {
          if (assignLeadBusy) return;
          setAssignLeadOpen(false);
          setAssignLeadUserIds(activeLead?.assignedToUserIds?.length ? activeLead.assignedToUserIds : activeLead?.assignedToUserId ? [activeLead.assignedToUserId] : []);
        }}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        closeVariant="x"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              onClick={() => void assignLeadToUser()}
              disabled={assignLeadBusy}
            >
              {assignLeadBusy ? "Assigning…" : "Assign lead"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-600">Team members</div>
            <div className="mt-1">
              <PortalMultiSelectDropdown
                value={assignLeadUserIds}
                onChange={setAssignLeadUserIds}
                options={leadAssigneeOptions}
                placeholder="Select teammates…"
              />
            </div>
          </div>
          <div className="text-xs text-zinc-500">Pick teammates only when you want to change ownership.</div>
        </div>
      </AppModal>

      <AppModal
        open={addToNurtureOpen}
        title="Add to nurture campaign"
        description="Choose which nurture campaign this lead should be added to."
        onClose={() => {
          if (addToNurtureBusy) return;
          setAddToNurtureOpen(false);
          setSelectedNurtureCampaignId("");
        }}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        closeVariant="x"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              onClick={() => void addLeadToNurtureCampaign()}
              disabled={addToNurtureBusy || !selectedNurtureCampaignId}
            >
              {addToNurtureBusy ? "Adding…" : "Add to campaign"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-600">Nurture campaign</div>
            <div className="mt-1">
              <PortalSelectDropdown<string>
                value={selectedNurtureCampaignId || null}
                onChange={(next) => setSelectedNurtureCampaignId(String(next || ""))}
                options={nurtureCampaignOptions}
                placeholder="Select a nurture campaign…"
                buttonClassName={classNames("flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm outline-none hover:bg-white/80", portalGlassButtonClass)}
              />
            </div>
          </div>
          {nurtureCampaignLoadError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <div className="font-semibold text-red-900">Nurture campaigns need attention</div>
              <div className="mt-1 leading-5">{nurtureCampaignLoadError}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Retry
                </button>
                <Link
                  href={`${portalBasePath}/app/services/nurture-campaigns`}
                  className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                >
                  Open nurture campaigns
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </AppModal>
    </>
  ) : null;

  return (
    <div
      className={classNames(
        isLeadMapLayout || isScraperLayout || isSettingsLayout
          || isConsumerLeadsLayout
          ? leadScrapingFullBleedShellClass
          : "mx-auto w-full max-w-6xl px-4 sm:px-6",
      )}
    >
      {!isLeadMapLayout && !isScraperLayout && !isSettingsLayout && !isConsumerLeadsLayout ? (
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div />
          <div className="w-full sm:w-auto">
            <SuggestedSetupModalLauncher serviceSlugs={["lead-scraping"]} buttonLabel="Suggested setup" />
          </div>
        </div>
      ) : null}

      {tab === "b2b" ? (
        <>
          {activeB2bSubTab === "pull" ? (
            <div className={leadScrapingEdgeFrameClass}>
              <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                <div className="flex min-h-0 flex-col overflow-hidden border-b border-zinc-200 lg:border-b-0 lg:border-r">
                  <div className="shrink-0 px-4 py-3 sm:px-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-brand-ink">Scraper</div>
                        <div className="mt-1 text-sm text-zinc-600">Scrape leads and keep the latest leads on the right.</div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        {running ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">1 running</span> : null}
                        <div className="text-right text-xs text-zinc-500">
                          Est. max cost per run: <span className="font-semibold text-zinc-900">{estimatedRunCost}</span> credits
                        </div>
                      </div>
                    </div>

                    {!placesConfigured ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Google Places is not linked in this environment yet. Add `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` to turn on live location discovery here.
                      </div>
                    ) : null}
                  </div>

                  <div className={classNames("min-h-0 flex-1 px-4 pb-3 sm:px-6 sm:pb-4", leadPaneScrollClass)}>
                    <div className="max-w-3xl space-y-4 pt-1">
                      <label className="block">
                        <div className="text-sm font-medium text-zinc-800/90">Niche / keywords</div>
                        <div className="mt-2">
                          <PortalMultiSelectDropdown
                            label="Niche / keywords"
                            value={b2bNicheSelections}
                            options={nicheKeywordOptions}
                            allowCustom
                            placeholder="Search or add keywords…"
                            emptyLabel="Type to add a niche or keyword"
                            onChange={(next) =>
                              setSettings((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      b2b: syncB2bSelections(prev.b2b, { niches: next }),
                                    }
                                  : prev,
                              )
                            }
                          />
                        </div>
                      </label>

                      <label className="block">
                        <div className="text-sm font-medium text-zinc-800/90">Locations</div>
                        <div ref={locationDropdownRef} className="mt-2">
                          <div
                            className={classNames(
                              "relative rounded-3xl bg-white/60 p-2 backdrop-blur-2xl",
                              locationSuggestionsVisible ? "z-70" : "z-10",
                              portalGlassPanelClass,
                            )}
                          >
                            <input
                              ref={locationInputRef}
                              className="w-full bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
                              value={locationSearch}
                              onFocus={() => {
                                const query = locationSearch.trim();
                                if (!query) return;
                                const cached = locationSearchCacheRef.current.get(query.toLowerCase());
                                if (cached?.length) setLocationSuggestions(cached);
                                setLocationSuggestionsVisible(true);
                              }}
                              onChange={(e) => {
                                setLocationSearch(e.target.value);
                                setLocationSuggestionsVisible(Boolean(e.target.value.trim()));
                              }}
                              placeholder="Search city, state, or ZIP…"
                            />

                            {locationSuggestionsVisible && (locationSearch.trim() || locationSuggestions.length || locationSuggestionsBusy) ? (
                              <div className={classNames("absolute left-2 right-2 top-[calc(100%+8px)] z-80 overflow-hidden rounded-2xl bg-white/70 backdrop-blur-2xl", portalGlassPanelClass)}>
                                <div className="max-h-72 overflow-auto p-2">
                                  {locationSuggestions.length ? (
                                    <div className="space-y-1">
                                      {locationSuggestions.map((suggestion) => (
                                        <button
                                          key={suggestion.value}
                                          type="button"
                                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition hover:bg-[rgba(29,78,216,0.08)]"
                                          onClick={() => {
                                            setSettings((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    b2b: syncB2bSelections(prev.b2b, {
                                                      locations: [...b2bLocationSelections, suggestion.value],
                                                    }),
                                                  }
                                                : prev,
                                            );
                                            setLocationSuggestionsVisible(false);
                                          }}
                                        >
                                          {suggestion.label}
                                        </button>
                                      ))}
                                    </div>
                                  ) : locationSuggestionsBusy ? (
                                    <div className="px-3 py-2 text-sm text-zinc-500">Finding location matches…</div>
                                  ) : !b2bLocationSelections.some((entry) => entry.toLowerCase() === locationSearch.trim().toLowerCase()) ? (
                                    <button
                                      type="button"
                                      className="w-full rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-left text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                                      onClick={() => {
                                        const nextValue = locationSearch.trim();
                                        if (!nextValue) return;
                                        setSettings((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                b2b: syncB2bSelections(prev.b2b, {
                                                  locations: [...b2bLocationSelections, nextValue],
                                                }),
                                              }
                                            : prev,
                                        );
                                        setLocationSuggestionsVisible(false);
                                      }}
                                    >
                                      Add “{locationSearch.trim()}”
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {b2bLocationSelections.length ? (
                            <div className="relative z-0 mt-3 flex flex-wrap gap-2">
                              {b2bLocationSelections.map((value) => (
                                <span
                                  key={value}
                                  className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[rgba(29,78,216,0.10)] px-3 py-1 text-xs font-semibold text-brand-blue/90 shadow-[0_8px_18px_rgba(29,78,216,0.07)] backdrop-blur-xl"
                                >
                                  <span className="max-w-52 truncate">{value}</span>
                                  <button
                                    type="button"
                                    className="rounded-full px-1 text-[11px] font-semibold text-brand-blue/70 hover:text-brand-blue"
                                    onClick={() =>
                                      setSettings((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              b2b: syncB2bSelections(prev.b2b, {
                                                locations: b2bLocationSelections.filter((entry) => entry !== value),
                                              }),
                                            }
                                          : prev,
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-3 text-xs text-zinc-600">
                              <div className="font-semibold text-zinc-900">Choose the first location</div>
                              <div className="mt-1">Add at least one city, ZIP code, or region so the next pull knows where to search.</div>
                              <button
                                type="button"
                                className="mt-3 rounded-xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-xs font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                                onClick={() => {
                                  setLocationSearch("");
                                  setLocationSuggestionsVisible(true);
                                }}
                              >
                                Add location
                              </button>
                            </div>
                          )}
                        </div>
                      </label>

                      <label className="block">
                        <div className="text-sm font-medium text-zinc-800">Count</div>
                        <input
                          className="mt-2 h-11 w-28 rounded-2xl border border-transparent bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-[0_10px_24px_rgba(15,23,42,0.08)] outline-none"
                          type="number"
                          min={1}
                          max={500}
                          value={settings.b2b.count}
                          onChange={(e) =>
                            setSettings((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    b2b: {
                                      ...prev.b2b,
                                      count: clampInt(Number(e.target.value), 1, 500),
                                    },
                                  }
                                : prev,
                            )
                          }
                        />
                        <div className="mt-1 text-xs text-zinc-500">Recommended: 60 or less per scrape.</div>
                      </label>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-sm font-medium text-zinc-800">Filters</div>
                        <div className="mt-3 space-y-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-700">Require address</span>
                            <ToggleSwitch
                              checked={settings.b2b.requireAddress ?? true}
                              accent="blue"
                              onChange={(checked) =>
                                setSettings((prev) => (prev ? { ...prev, b2b: syncB2bSelections(prev.b2b, { requireAddress: checked }) } : prev))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-700">Require email</span>
                            <ToggleSwitch
                              checked={settings.b2b.requireEmail}
                              accent="blue"
                              onChange={(checked) =>
                                setSettings((prev) => (prev ? { ...prev, b2b: { ...prev.b2b, requireEmail: checked } } : prev))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-700">Require phone</span>
                            <ToggleSwitch
                              checked={settings.b2b.requirePhone}
                              accent="blue"
                              onChange={(checked) =>
                                setSettings((prev) => (prev ? { ...prev, b2b: { ...prev.b2b, requirePhone: checked } } : prev))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-700">Require website</span>
                            <ToggleSwitch
                              checked={settings.b2b.requireWebsite}
                              accent="blue"
                              onChange={(checked) =>
                                setSettings((prev) => (prev ? { ...prev, b2b: { ...prev.b2b, requireWebsite: checked } } : prev))
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-zinc-700">AI verification</span>
                            <ToggleSwitch
                              checked={Boolean(settings.b2b.aiVerifyBusinesses)}
                              accent="blue"
                              onChange={(checked) =>
                                setSettings((prev) => (prev ? { ...prev, b2b: { ...prev.b2b, aiVerifyBusinesses: checked } } : prev))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="shrink-0 border-t border-zinc-200 px-4 py-5 sm:px-6">
                    <div className="flex flex-col justify-end gap-3 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={runB2bNow}
                        disabled={running || !placesConfigured}
                        className={leadActionGreenSoftClass}
                      >
                        {running
                          ? plannedBatchesUi > 1
                            ? `Running ${plannedBatchesUi} batches…`
                            : "Running…"
                          : "Run now"}
                      </button>
                      {running ? (
                        <button
                          type="button"
                          onClick={cancelB2bRun}
                          className={leadActionRoseSoftClass}
                        >
                          {cancelingRun ? "Canceling…" : "Cancel Run"}
                        </button>
                      ) : null}
                      {saveControl}
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col overflow-hidden">
                  <div className="shrink-0 border-b border-zinc-200 px-4 py-3 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-base font-semibold text-brand-ink">Leads</div>
                      <button
                        type="button"
                        onClick={() => downloadText(`leads_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(latestRunLeads))}
                        disabled={!latestRunLeads.length}
                        className={leadActionExportCompactClass}
                      >
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className={classNames("min-h-0 flex-1", leadPaneScrollClass)}>
                    <div>
                      {latestRunLeads.length ? (
                        latestRunLeads.map((lead) => (
                          <div
                            key={lead.id}
                            className="w-full scroll-mt-4 border-b border-zinc-200 bg-white px-4 py-4 text-left transition-colors hover:bg-zinc-50 sm:px-6 sm:scroll-mt-6"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-brand-ink">{lead.businessName}</div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                                  {lead.phone ? <span className="whitespace-nowrap">{lead.phone}</span> : null}
                                  {lead.phone && lead.website ? <span>•</span> : null}
                                  {lead.website ? <span className="min-w-0 max-w-full truncate">{lead.website}</span> : null}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => openLeadOnMap(lead.id)}
                                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink shadow-[0_6px_14px_rgba(15,23,42,0.05)] hover:bg-zinc-50"
                              >
                                View on map
                              </button>
                            </div>

                            <div className="mt-2 text-xs text-zinc-600">{[lead.niche, lead.address].filter(Boolean).join(" • ") || "Location details still syncing"}</div>
                            {lead.synopsis ? <div className="mt-2 text-xs leading-5 text-zinc-600">{lead.synopsis}</div> : null}
                            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                              <span>{safeFormatDateTime(lead.createdAtIso)}</span>
                              <span>{lead.latitude != null && lead.longitude != null ? "Mapped" : "Map pending"}</span>
                            </div>
                          </div>
                        ))
                      ) : latestRunLeadsBusy ? (
                        <div className="px-4 py-4 text-sm text-zinc-600 sm:px-6">Loading leads…</div>
                      ) : (
                        <div className="px-4 py-4 text-sm text-zinc-600 sm:px-6">Scrape leads to see them here.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeB2bSubTab === "leads" ? (
            <div className={leadScrapingEdgeFrameClass}>
              <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-2">
                <div className="flex min-h-0 flex-col overflow-hidden border-b border-zinc-200 lg:border-b-0 lg:border-r">
                  {showInlineLeadDetail && activeLead ? (
                    <div className={classNames("min-h-0 flex-1 px-4 py-4 sm:px-6", leadPaneScrollClass)}>
                      {leadDetailBody}
                    </div>
                  ) : (
                    <>
                      <div className="shrink-0 border-b border-zinc-200 px-4 py-3 sm:px-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-base font-semibold text-brand-ink">Leads</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {leadsBusy && !hasLoadedLeadsOnceRef.current
                                ? "Loading leads…"
                                : typeof leadTotalCount === "number"
                                ? leadQueryDebounced
                                  ? `Showing ${leads.length} of ${leadMatchedCount ?? leads.length} matched • ${leadTotalCount} total`
                                  : `${leadTotalCount} total`
                                : `${leads.length} loaded`}
                              {!leadsBusy && typeof leadTotalCount === "number" && leadTotalCount > leadsTake ? ` • Loaded first ${leadsTake}` : ""}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => downloadText(`leads_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(leads))}
                              disabled={!leads.length}
                              className={leadActionExportClass}
                            >
                              Export CSV
                            </button>
                          </div>
                        </div>

                        <div className="mt-3">
                          <input
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                            value={leadQuery}
                            onChange={(e) => setLeadQuery(e.target.value)}
                            placeholder="Search leads (name, email, phone, website, address, niche…)"
                          />
                        </div>
                      </div>

                      <div ref={leadListScrollRef} className={classNames("min-h-0 flex-1", leadPaneScrollClass)}>
                        <div>
                          {leads.length ? (
                            leads.map((l, idx) => {
                              const selected = selectedLead?.id === l.id;
                              return (
                                <div
                                  key={l.id}
                                  ref={(node) => {
                                    leadRowRefs.current.set(l.id, node);
                                  }}
                                  onClick={() => selectLeadAtIndex(idx)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      selectLeadAtIndex(idx);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className={classNames(
                                    "w-full scroll-mt-4 border-b border-zinc-200 px-4 py-3.5 text-left transition-colors sm:px-6 sm:scroll-mt-6",
                                    selected
                                      ? "bg-[rgba(29,78,216,0.12)]"
                                      : "bg-white hover:bg-zinc-50",
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-brand-ink">
                                        {l.starred ? <span className="mr-1 text-amber-500">★</span> : null}
                                        {l.businessName}
                                      </div>
                                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                                        {l.phone ? <span className="whitespace-nowrap">{l.phone}</span> : null}
                                        {l.phone && l.website ? <span>•</span> : null}
                                        {l.website ? <span className="min-w-0 max-w-full truncate">{l.website}</span> : null}
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                      {l.tag ? (
                                        <span
                                          className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                                          style={leadTagPillStyle(isHexColor(l.tagColor || "") ? (l.tagColor as string) : "#111827")}
                                        >
                                          {l.tag}
                                        </span>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openLeadAtIndex(idx);
                                        }}
                                        className={classNames(
                                          "inline-flex items-center justify-center rounded-2xl px-3 py-1.5 text-xs font-semibold text-brand-ink",
                                          selected
                                            ? "bg-white shadow-[0_6px_14px_rgba(255,255,255,0.4)]"
                                            : "border border-zinc-200 bg-white hover:bg-zinc-50",
                                        )}
                                      >
                                        See more
                                      </button>
                                    </div>
                                  </div>

                                  <div className="mt-2 text-xs text-zinc-600">{[l.niche, l.address].filter(Boolean).join(" • ") || "Location details still syncing"}</div>
                                  {l.synopsis ? <div className="mt-2 text-xs leading-5 text-zinc-600">{l.synopsis}</div> : null}
                                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                                    <span>{safeFormatDateTime(l.createdAtIso)}</span>
                                    <span>{l.latitude != null && l.longitude != null ? "Mapped" : "Map pending"}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : leadsBusy && !hasLoadedLeadsOnceRef.current ? (
                            <div className="px-4 py-6 text-sm text-zinc-600 sm:px-6">Loading leads…</div>
                          ) : (
                            <div className="px-4 py-6 text-sm text-zinc-600 sm:px-6">
                              <button
                                type="button"
                                onClick={() => navigateToB2bSubTab("pull")}
                                className="inline-flex items-center rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 font-semibold text-(--color-brand-blue) transition hover:bg-[rgba(29,78,216,0.18)]"
                              >
                                Run your first pull
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="min-h-0 h-full overflow-hidden">
                  {leadsBusy && !hasLoadedLeadsOnceRef.current ? (
                    <div className="flex h-full min-h-[50svh] items-center justify-center bg-zinc-50 text-center text-sm text-zinc-500">
                      <div className="max-w-sm px-6 font-semibold text-zinc-700">Loading map…</div>
                    </div>
                  ) : (
                    <LeadLocationsMap
                      points={leads.map((lead) => ({
                        id: lead.id,
                        businessName: lead.businessName,
                        address: lead.address,
                        latitude: lead.latitude ?? null,
                        longitude: lead.longitude ?? null,
                        tagColor:
                          lead.contactTags?.find((tag) => isHexColor(tag.color || ""))?.color ??
                          lead.tagColor ??
                          null,
                      }))}
                      selectedLeadId={selectedLead?.id ?? null}
                      onSelectLead={(leadId) => selectLeadById(leadId, { scrollIntoView: true })}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className={leadScrapingEdgeFrameClass}>
              <div className="flex h-full min-h-0 flex-col bg-white">
                <AppModal
                  open={exclusionsModalOpen}
                  title="Manage Exclusions"
                  description={activeExclusionSection ? activeExclusionSection.description : "Choose what to exclude from future business pulls."}
                  onClose={closeExclusionsModal}
                  widthClassName="w-[min(680px,calc(100vw-32px))]"
                  footer={exclusionsModalChanged || activeExclusionSection ? (
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      {activeExclusionSection ? (
                        <button
                          type="button"
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
                          onClick={() => {
                            setExclusionsModalKind(null);
                          }}
                        >
                          Add Another Way
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)] disabled:cursor-default disabled:bg-[rgba(29,78,216,0.08)] disabled:text-[rgba(29,78,216,0.45)]"
                        disabled={!exclusionsModalChanged}
                        onClick={() => {
                          if (exclusionsModalKind && activeExclusionDraft.trim()) addExclusionValue(exclusionsModalKind);
                          commitExclusionsDrafts();
                          closeExclusionsModal();
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : undefined}
                >
                  <div className="space-y-4">
                    {!activeExclusionSection ? (
                      <div className="flex flex-wrap justify-center gap-3">
                        {exclusionSections.map((section) => (
                          <button
                            key={section.kind}
                            type="button"
                            onClick={() => setExclusionsModalKind(section.kind)}
                            className={classNames(
                              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                              section.kind === "name"
                                ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                                : section.kind === "domain"
                                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : section.kind === "phone"
                                    ? "bg-violet-50 text-violet-700 hover:bg-violet-100"
                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                            )}
                          >
                            {section.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {activeExclusionSection ? (
                      <>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            className="h-11 w-full flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm"
                            placeholder={activeExclusionSection.placeholder}
                            value={activeExclusionDraft}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (exclusionsModalKind === "name") setExcludeNameDraft(next);
                              if (exclusionsModalKind === "domain") setExcludeDomainDraft(next);
                              if (exclusionsModalKind === "phone") setExcludePhoneDraft(next);
                              if (exclusionsModalKind === "address") setExcludeAddressDraft(next);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" || !exclusionsModalKind) return;
                              event.preventDefault();
                              addExclusionValue(exclusionsModalKind);
                            }}
                          />
                          <button
                            type="button"
                            className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                            onClick={() => {
                              if (exclusionsModalKind) addExclusionValue(exclusionsModalKind);
                            }}
                          >
                            Add
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>or upload CSV</span>
                          <label className="inline-flex cursor-pointer items-center rounded-xl bg-zinc-100 px-3 py-2 font-semibold text-zinc-700 hover:bg-zinc-200">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              disabled={activeExclusionSection.busy}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void importExclusionsCsv(activeExclusionSection.kind, f);
                              }}
                            />
                            {activeExclusionSection.busy ? "Importing…" : "Upload CSV"}
                          </label>
                        </div>

                        {activeExclusionSection.values.length ? (
                          <div className="flex flex-wrap gap-2">
                            {activeExclusionSection.values.slice(0, 200).map((value) => (
                              <span
                                key={value}
                                className="inline-flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800"
                              >
                                <span className="max-w-52 truncate">{value}</span>
                                <button
                                  type="button"
                                  className="text-zinc-400 transition hover:text-zinc-700"
                                  onClick={() => removeExclusionValue(activeExclusionSection.kind, value)}
                                  aria-label={`Remove ${value}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </AppModal>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-1 divide-y divide-zinc-200 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] xl:divide-x xl:divide-y-0">
                    <div className="bg-zinc-50 px-4 py-5 sm:px-6 sm:py-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-brand-ink">Exclude these businesses</div>
                            <div className="mt-1 text-sm text-zinc-600">Previously pulled leads will never be repeated.</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              openExclusionsModal();
                            }}
                            className="inline-flex items-center rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                          >
                            Manage Exclusions
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {savedExclusionSections.map((section) => (
                            <span
                              key={section.kind}
                              className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                            >
                              {section.label} • {section.values.length}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {savedExclusionSections.flatMap((section) => section.values.map((value) => ({ value, kind: section.kind }))).length ? (
                            savedExclusionSections
                              .flatMap((section) => section.values.map((value) => ({ value, kind: section.kind })))
                              .slice(0, 6)
                              .map((item) => (
                                <span
                                  key={`${item.kind}-${item.value}`}
                                  className="inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                                >
                                  <span className="max-w-44 truncate">{item.value}</span>
                                  <button
                                    type="button"
                                    className="text-zinc-400 transition hover:text-zinc-700"
                                    onClick={() => removeExclusionValue(item.kind, item.value)}
                                    aria-label={`Remove ${item.value}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-3 text-xs text-zinc-600">
                              <div className="font-semibold text-zinc-900">Add your first exclusion</div>
                              <div className="mt-1">Add names, domains, phones, or addresses here if future pulls should skip them automatically.</div>
                              <button
                                type="button"
                                className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                onClick={() => setExclusionsModalKind("domain")}
                              >
                                Add exclusion
                              </button>
                            </div>
                          )}
                        </div>
                    </div>

                    <div className="bg-zinc-50 px-4 py-5 sm:px-6 sm:py-6">
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
                          <span className="font-medium text-zinc-800">Run automatically</span>
                          <ToggleSwitch
                            checked={settings.b2b.scheduleEnabled}
                            accent="blue"
                            onChange={(checked) =>
                              setSettings((prev) =>
                                prev ? { ...prev, b2b: { ...prev.b2b, scheduleEnabled: checked } } : prev,
                              )
                            }
                          />
                        </div>

                        <label className="mt-4 block">
                          <div className="text-sm font-medium text-zinc-800">Frequency</div>

                          <div className="mt-2 flex gap-2">
                            <input
                              className="h-10 w-28 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                              type="number"
                              min={1}
                              max={b2bFrequencyUnit === "days" ? 60 : b2bFrequencyUnit === "weeks" ? 8 : 2}
                              value={b2bFrequencyCount}
                              onChange={(e) => {
                                const nextCount = clampInt(
                                  Number(e.target.value),
                                  1,
                                  b2bFrequencyUnit === "days" ? 60 : b2bFrequencyUnit === "weeks" ? 8 : 2,
                                );
                                setB2bFrequencyCount(nextCount);

                                const nextDays =
                                  b2bFrequencyUnit === "days"
                                    ? nextCount
                                    : b2bFrequencyUnit === "weeks"
                                      ? nextCount * 7
                                      : nextCount * 30;

                                setSettings((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        b2b: { ...prev.b2b, frequencyDays: clampInt(nextDays, 1, 60) },
                                      }
                                    : prev,
                                );
                              }}
                            />

                            <PortalListboxDropdown
                              value={b2bFrequencyUnit}
                              options={B2B_FREQUENCY_UNIT_OPTIONS}
                              buttonClassName="flex h-10 w-full flex-1 items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50"
                              onChange={(nextUnit) => {
                                setB2bFrequencyUnit(nextUnit);

                                const normalizedCount = clampInt(
                                  b2bFrequencyCount,
                                  1,
                                  nextUnit === "days" ? 60 : nextUnit === "weeks" ? 8 : 2,
                                );
                                setB2bFrequencyCount(normalizedCount);

                                const nextDays =
                                  nextUnit === "days"
                                    ? normalizedCount
                                    : nextUnit === "weeks"
                                      ? normalizedCount * 7
                                      : normalizedCount * 30;

                                setSettings((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        b2b: { ...prev.b2b, frequencyDays: clampInt(nextDays, 1, 60) },
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </div>

                          <div className="mt-2 text-xs text-zinc-500">
                            Last run: {settings.b2b.lastRunAtIso ? new Date(settings.b2b.lastRunAtIso).toLocaleString() : "Never"}
                          </div>
                        </label>
                    </div>

                    <div className="bg-zinc-50 px-4 py-5 sm:px-6 sm:py-6 xl:col-span-2">
                      {renderOutboundEditor({ outerClassName: "", accent: "blue" })}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-4 sm:px-6">
                  <div className="flex justify-start">{saveControl}</div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <section className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.98)_22%,rgba(219,234,254,0.95)_38%,rgba(253,242,248,0.94)_68%,rgba(236,72,153,0.12)_100%)] px-6 text-center sm:px-10">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center">
            <div className="text-3xl font-semibold tracking-[-0.02em] text-zinc-950 sm:text-5xl">Want consumer leads?</div>
            <div className="mt-5 max-w-2xl text-base leading-7 text-zinc-700 sm:text-xl sm:leading-8">
              Book a call and we’ll tailor sources, filters, and follow up for your market.
            </div>
            <a
              href={toPurelyHostedUrl("/book-a-call")}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center justify-center rounded-2xl bg-(--color-brand-pink) px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(236,72,153,0.22)] transition-opacity duration-150 hover:opacity-95 sm:px-7 sm:text-base"
            >
              Book a call
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
