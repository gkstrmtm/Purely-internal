"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { ElevenLabsConvaiWidget } from "@/components/ElevenLabsConvaiWidget";
import { PortalSelectDropdown, type PortalSelectOption } from "@/components/PortalSelectDropdown";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { useToast } from "@/components/ToastProvider";
import { type FeedbackTriagePriority as FeedbackPriority, type FeedbackTriageStatus as FeedbackStatus } from "@/lib/betaFeedback";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@/lib/entitlements.shared";

type UserRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  invitesSentCount?: number;
  invitesVerifiedCount?: number;
  inviteCreditsAwardedCount?: number;
  overrides: ModuleKey[];
  creditsOnlyOverride?: boolean;
  creditsBalance?: number;
  phone?: string | null;
  businessName?: string | null;
  businessEmail?: string | null;
  twilio?: { configured: boolean; fromNumberE164: string | null };
  voiceAgentIds?: { profile: string | null; aiReceptionist: string | null };
};

type OverridesResponse = {
  users: UserRow[];
  modules: ModuleKey[];
};

type OwnerDetails = {
  ok: true;
  owner: {
    id: string;
    email: string;
    name: string;
    active: boolean;
    role: string;
    deletedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    timeZone: string;
    stripe: { connected: boolean; accountId: string | null; connectedAt: string | null };
    portal: {
      creditsOnlyOverride: boolean;
      creditsBalance: number;
      overrides: ModuleKey[];
      phone: string | null;
      mailboxEmail: string | null;
    };
    ai: { voiceAgentIds: { profile: string | null; aiReceptionist: string | null } };
    integrations: {
      twilio: { configured: boolean; fromNumberE164: string | null };
      salesReporting: {
        activeProvider: string | null;
        connectedProviders: Array<{ provider: string; displayHint: string | null }>;
      };
    };
    businessProfile:
      | null
      | {
          businessName: string;
          websiteUrl?: string | null;
          industry?: string | null;
          businessModel?: string | null;
          targetCustomer?: string | null;
          brandVoice?: string | null;
          logoUrl?: string | null;
          brandPrimaryHex?: string | null;
          brandAccentHex?: string | null;
          brandTextHex?: string | null;
          brandFontFamily?: string | null;
          brandFontGoogleFamily?: string | null;
        };
    usage: {
      lastActivityAt: string | null;
      mostUsedServices: Array<{ key: string; count: number }>;
      portalEngagement?: {
        topPages: Array<{ key: string; seconds: number }>;
        recentActivity: Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }>;
      };
      portalDiagnostics?: {
        lastSeenAt: string | null;
        actionFailureCount: number;
        runtimeErrorCount: number;
        unhandledRejectionCount: number;
        resourceErrorCount: number;
        recentEvents: Array<{
          id: string;
          kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure";
          createdAtIso: string;
          lastSeenAtIso: string;
          count: number;
          message: string;
          path?: string;
          source?: string;
          file?: string;
          area?: string | null;
          action?: string | null;
          status?: number | null;
        }>;
        bugReports: { count: number; lastReportedAt: string | null };
        betaFeedback: {
          count: number;
          lastSubmittedAt: string | null;
          recentItems: Array<{
            id: string;
            createdAtIso: string;
            updatedAtIso: string | null;
            title: string;
            message: string;
            expected: string | null;
            category: string;
            severity: string;
            area: string | null;
            path: string | null;
            serviceSlug: string | null;
            portalVariant: string | null;
            reporterEmail: string | null;
            triage: {
              status: string;
              priority: string;
              backlogRef: string | null;
              promptRef: string | null;
              exportBucket: string | null;
              notes: string | null;
              reviewerEmail: string | null;
              lastReviewedAtIso: string | null;
            };
          }>;
        };
      };
      newsletter: { failedLast30: number; sentLast30: number };
      leadScraping: { runsLast30: number };
      booking: { bookingsCreatedLast30: number; bookingsUpcoming: number };
      hoursSaved: { secondsLast30: number };
      blog: { generationEventsLast30: number };
    };
  };
  hostedLinks?: {
    funnels: Array<{ name: string; slug: string; url: string }>;
    blog: null | { indexUrl: string };
    newsletters: null | { indexUrl: string };
    reviews: null | { indexUrl: string };
    booking: null | { url: string; slug: string };
  };
};

type PortalDiagnosticsDetails = NonNullable<OwnerDetails["owner"]["usage"]["portalDiagnostics"]>;
type PortalFeedbackItem = PortalDiagnosticsDetails["betaFeedback"]["recentItems"][number];
type DetailTab = "overview" | "billing" | "overrides" | "access" | "activity" | "diagnostics";
type CreditsFilter = "all" | "credits-only" | "subscription";
type TwilioFilter = "all" | "on" | "off";
type OverrideFilter = "all" | "enabled" | "none";
type BalanceFilter = "all" | "zero" | "low" | "mid" | "high";
type LifecycleFilter = "all" | "active" | "inactive" | "deleted" | "test";

const CREDITS_FILTER_OPTIONS: Array<PortalSelectOption<CreditsFilter>> = [
  { value: "all", label: "All billing modes" },
  { value: "credits-only", label: "Credits-only" },
  { value: "subscription", label: "Env default" },
];

const TWILIO_FILTER_OPTIONS: Array<PortalSelectOption<TwilioFilter>> = [
  { value: "all", label: "Twilio any" },
  { value: "on", label: "Twilio on" },
  { value: "off", label: "Twilio off" },
];

const OVERRIDE_FILTER_OPTIONS: Array<PortalSelectOption<OverrideFilter>> = [
  { value: "all", label: "Any override state" },
  { value: "enabled", label: "Overrides enabled" },
  { value: "none", label: "No overrides" },
];

const BALANCE_FILTER_OPTIONS: Array<PortalSelectOption<BalanceFilter>> = [
  { value: "all", label: "Any balance" },
  { value: "zero", label: "0 credits" },
  { value: "low", label: "1-49 credits" },
  { value: "mid", label: "50-199 credits" },
  { value: "high", label: "200+ credits" },
];

const LIFECYCLE_FILTER_OPTIONS: Array<PortalSelectOption<LifecycleFilter>> = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "deleted", label: "Deleted" },
  { value: "test", label: "Test / demo" },
];

const FEEDBACK_STATUS_OPTIONS: Array<PortalSelectOption<FeedbackStatus>> = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "planned", label: "Planned" },
  { value: "shipped", label: "Shipped" },
  { value: "closed", label: "Closed" },
];

const FEEDBACK_PRIORITY_OPTIONS: Array<PortalSelectOption<FeedbackPriority>> = [
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
  { value: "p4", label: "P4" },
];

type FeedbackDraft = {
  status: string;
  priority: string;
  backlogRef: string;
  promptRef: string;
  exportBucket: string;
  notes: string;
};

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "billing", label: "Billing / Credits" },
  { key: "overrides", label: "Service Overrides" },
  { key: "access", label: "Credentials / Access" },
  { key: "activity", label: "Activity / Audit" },
  { key: "diagnostics", label: "Diagnostics" },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function LoadingLine({ className = "" }: { className?: string }) {
  return <div className={`h-3 rounded-full bg-zinc-200/80 ${className}`.trim()} />;
}

function LoadingChip({ className = "" }: { className?: string }) {
  return <div className={`h-7 rounded-full bg-zinc-200/80 ${className}`.trim()} />;
}

function LoadingToggleCard() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5 pr-2">
          <LoadingLine className="h-4 w-24 max-w-full" />
          <LoadingLine className="w-28 max-w-[85%]" />
        </div>
        <div className="mt-0.5 h-6 w-11 shrink-0 rounded-full bg-zinc-200/80" />
      </div>
    </div>
  );
}

function LoadingConsoleRow() {
  return (
    <div className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1 space-y-2"><LoadingLine className="h-5 w-60 max-w-full" /><LoadingLine className="w-40 max-w-[70%]" /></div>
            <LoadingChip className="w-20" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"><LoadingLine className="w-20" /><LoadingLine className="w-32" /><LoadingLine className="w-24" /></div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"><LoadingLine className="w-16" /><LoadingChip className="w-24" /><LoadingChip className="w-20" /></div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"><LoadingLine className="w-16" /><LoadingLine className="h-6 w-12" /><LoadingLine className="w-24" /></div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"><LoadingLine className="w-20" /><LoadingLine className="w-28" /><LoadingLine className="w-24" /></div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 xl:ml-4"><div className="h-10 w-28 rounded-xl bg-zinc-200/80" /><div className="h-10 w-24 rounded-xl bg-zinc-200/80" /></div>
      </div>
    </div>
  );
}

function LoadingDetailPanel() {
  return (
    <div className="animate-pulse rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3"><LoadingLine className="h-5 w-40" /><LoadingLine className="w-56" /></div>
        <LoadingChip className="w-20" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><LoadingChip className="w-24" /><LoadingChip className="w-24" /><LoadingChip className="w-28" /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"><LoadingLine className="w-14" /><LoadingLine className="h-6 w-16" /></div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"><LoadingLine className="w-18" /><LoadingLine className="h-6 w-20" /></div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"><LoadingLine className="w-18" /><LoadingLine className="h-6 w-14" /></div>
      </div>
      <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3"><LoadingLine className="w-32" /><LoadingLine className="w-full" /><LoadingLine className="w-4/5" /><LoadingLine className="w-3/5" /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }).map((_, index) => <LoadingToggleCard key={index} />)}</div>
    </div>
  );
}

function isTestAccount(user: Pick<UserRow, "email" | "name" | "businessName">) {
  const haystack = [user.email, user.name, user.businessName].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes("test") || haystack.includes("demo") || haystack.includes("example.invalid");
}

function getLifecycleValue(user: Pick<UserRow, "active" | "deletedAt" | "email" | "name" | "businessName">): Exclude<LifecycleFilter, "all"> {
  if (user.deletedAt) return "deleted";
  if (!user.active) return "inactive";
  if (isTestAccount(user)) return "test";
  return "active";
}

function lifecycleBadgeClassName(value: Exclude<LifecycleFilter, "all">) {
  if (value === "deleted") return "bg-red-100 text-red-800";
  if (value === "inactive") return "bg-zinc-200 text-zinc-700";
  if (value === "test") return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-800";
}

function billingModeLabel(user: Pick<UserRow, "creditsOnlyOverride">) {
  return user.creditsOnlyOverride ? "Credits-only" : "Env default";
}

type PortalOverrideUserCardProps = {
  user: UserRow;
  selectionMode: boolean;
  isSelected: boolean;
  isDetailsOpen: boolean;
  onToggleSelected: (ownerId: string) => void;
  onOpenDetails: (ownerId: string) => void;
  onOpenTesting: (ownerId: string) => void;
  onCopyValue: (label: string, value: string | null | undefined) => Promise<void>;
};

const PortalOverrideUserCard = memo(function PortalOverrideUserCard({
  user,
  selectionMode,
  isSelected,
  isDetailsOpen,
  onToggleSelected,
  onOpenDetails,
  onOpenTesting,
  onCopyValue,
}: PortalOverrideUserCardProps) {
  const lifecycle = getLifecycleValue(user);
  const balance = Math.max(0, Math.floor(user.creditsBalance ?? 0));

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "rounded-[28px] border border-zinc-200 bg-white p-5 text-left shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300",
        isDetailsOpen && "border-zinc-900 shadow-md",
        selectionMode && isSelected && "border-red-400 bg-red-50/40 ring-4 ring-red-300 shadow-[0_0_0_8px_rgba(248,113,113,0.22)] focus-visible:ring-4 focus-visible:ring-red-300",
      )}
      onClick={() => {
        if (selectionMode) {
          onToggleSelected(user.id);
          return;
        }
        onOpenDetails(user.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (selectionMode) {
            onToggleSelected(user.id);
            return;
          }
          onOpenDetails(user.id);
        }
      }}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><div className="truncate text-lg font-semibold text-brand-ink">{user.email}</div><button type="button" className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800" onClick={(event) => { event.stopPropagation(); void onCopyValue("Login email", user.email); }}>Copy email</button></div>
              <div className="mt-1 truncate text-sm text-zinc-600">{user.businessName ? `${user.businessName} · ` : ""}{user.name || "No name"}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-medium">
              <span className={cn("rounded-full px-2.5 py-1", lifecycleBadgeClassName(lifecycle))}>{lifecycle}</span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">{billingModeLabel(user)}</span>
              <span className={cn("rounded-full px-2.5 py-1", user.twilio?.configured ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600")}>Twilio {user.twilio?.configured ? "On" : "Off"}</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-medium text-zinc-500">Contact</div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><div className="text-sm font-semibold text-zinc-900">{user.businessEmail ? "Mailbox configured" : "No mailbox"}</div>{user.businessEmail ? <button type="button" className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800" onClick={(event) => { event.stopPropagation(); void onCopyValue("Mailbox email", user.businessEmail); }}>Copy</button> : null}</div>
              <div className="mt-2 text-[11px] font-medium text-zinc-400">Phone</div>
              <div className="mt-1 flex flex-wrap items-center gap-2"><div className="font-mono text-xs text-zinc-500">{user.phone || "No phone"}</div>{user.phone ? <button type="button" className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800" onClick={(event) => { event.stopPropagation(); void onCopyValue("Phone", user.phone); }}>Copy</button> : null}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-medium text-zinc-500">Credits</div>
              <div className="mt-2 text-2xl font-semibold text-zinc-900">{balance}</div>
              <div className="mt-1 text-xs text-zinc-500">Balance available</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-medium text-zinc-500">Invites</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900">{Math.max(0, user.invitesSentCount ?? 0)} sent</div>
              <div className="mt-1 text-xs text-zinc-500">{Math.max(0, user.invitesVerifiedCount ?? 0)} verified · {Math.max(0, user.inviteCreditsAwardedCount ?? 0)} awarded</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-medium text-zinc-500">Overrides</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900">{user.overrides.length} enabled</div>
              <div className="mt-1 text-xs text-zinc-500">{user.overrides.length ? user.overrides.slice(0, 3).map((item) => MODULE_LABELS[item]).join(" · ") : "No overrides enabled"}</div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 xl:ml-4" onClick={(event) => event.stopPropagation()}>
          {selectionMode ? null : (
            <>
              <button type="button" className="rounded-xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95" onClick={() => onOpenDetails(user.id)}>Open account</button>
              <button type="button" className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" onClick={() => onOpenTesting(user.id)}>Testing</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.user === next.user
    && prev.selectionMode === next.selectionMode
    && prev.isSelected === next.isSelected
    && prev.isDetailsOpen === next.isDetailsOpen
    && prev.onToggleSelected === next.onToggleSelected
    && prev.onOpenDetails === next.onOpenDetails
    && prev.onOpenTesting === next.onOpenTesting
    && prev.onCopyValue === next.onCopyValue;
});

PortalOverrideUserCard.displayName = "PortalOverrideUserCard";

function balanceFilterMatches(value: number, filter: BalanceFilter) {
  if (filter === "all") return true;
  if (filter === "zero") return value <= 0;
  if (filter === "low") return value > 0 && value < 50;
  if (filter === "mid") return value >= 50 && value < 200;
  return value >= 200;
}

function formatIso(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

function formatHours(seconds: number | null | undefined) {
  const safeSeconds = typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = safeSeconds / 3600;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

function formatDurationShort(secondsRaw: number | null | undefined) {
  const seconds = typeof secondsRaw === "number" && Number.isFinite(secondsRaw) ? Math.max(0, Math.floor(secondsRaw)) : 0;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}

function groupRecentActivity(activity: Array<{ atMs: number; path: string; pageKey?: string; dtSec: number }>, opts?: { maxGapMs?: number; take?: number }) {
  const maxGapMs = Math.max(0, Math.floor(opts?.maxGapMs ?? 2500));
  const take = Math.max(1, Math.floor(opts?.take ?? 200));
  const normalized = activity
    .map((item) => {
      const endMs = Math.max(0, Math.floor(item.atMs));
      const dtSec = Math.max(1, Math.min(60, Math.floor(item.dtSec)));
      const startMs = Math.max(0, endMs - dtSec * 1000);
      const key = (item.pageKey || item.path || "").trim().slice(0, 512);
      return { key, startMs, endMs };
    })
    .filter((item) => Boolean(item.key) && item.endMs > 0)
    .sort((left, right) => left.startMs - right.startMs);

  const sessions: Array<{ key: string; startMs: number; endMs: number; seconds: number }> = [];
  for (const item of normalized) {
    const previous = sessions.length ? sessions[sessions.length - 1] : null;
    if (previous && previous.key === item.key && item.startMs <= previous.endMs + maxGapMs) {
      previous.endMs = Math.max(previous.endMs, item.endMs);
      previous.seconds = Math.max(1, Math.floor((previous.endMs - previous.startMs) / 1000));
      continue;
    }
    sessions.push({ key: item.key, startMs: item.startMs, endMs: item.endMs, seconds: Math.max(1, Math.floor((item.endMs - item.startMs) / 1000)) });
  }

  sessions.sort((left, right) => right.endMs - left.endMs);
  return sessions.slice(0, take);
}

function ColorSwatch({ hex }: { hex: string | null | undefined }) {
  const value = String(hex || "").trim();
  const isValid = /^#?[0-9a-fA-F]{3,8}$/.test(value);
  const cssValue = isValid ? (value.startsWith("#") ? value : `#${value}`) : "#e4e4e7";
  return <span className="inline-flex h-3 w-3 rounded-full border border-zinc-200" style={{ backgroundColor: cssValue }} />;
}

function portalDiagnosticKindLabel(kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure") {
  if (kind === "action_failure") return "Action";
  if (kind === "runtime_error") return "Runtime";
  if (kind === "unhandled_rejection") return "Promise";
  return "Resource";
}

function portalDiagnosticKindClassName(kind: "runtime_error" | "unhandled_rejection" | "resource_error" | "action_failure") {
  if (kind === "action_failure") return "bg-amber-100 text-amber-900";
  if (kind === "runtime_error") return "bg-red-100 text-red-900";
  if (kind === "unhandled_rejection") return "bg-orange-100 text-orange-900";
  return "bg-sky-100 text-sky-900";
}

function feedbackCategoryLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "Feedback";
  return raw.slice(0, 1).toUpperCase() + raw.slice(1);
}

function feedbackSeverityClassName(value: string | null | undefined) {
  if (value === "critical") return "bg-red-100 text-red-900";
  if (value === "high") return "bg-amber-100 text-amber-900";
  if (value === "medium") return "bg-sky-100 text-sky-900";
  return "bg-zinc-100 text-zinc-700";
}

function feedbackStatusClassName(value: string | null | undefined) {
  if (value === "planned") return "bg-violet-100 text-violet-900";
  if (value === "shipped") return "bg-emerald-100 text-emerald-900";
  if (value === "closed") return "bg-zinc-200 text-zinc-800";
  if (value === "reviewing") return "bg-amber-100 text-amber-900";
  return "bg-sky-100 text-sky-900";
}

async function fetchOverrides(q: string): Promise<OverridesResponse> {
  const url = new URL("/api/manager/portal/overrides", window.location.origin);
  if (q.trim()) url.searchParams.set("q", q.trim());
  url.searchParams.set("take", "500");
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load overrides (HTTP ${res.status})`);
  return (await res.json()) as OverridesResponse;
}

async function fetchOwnerDetails(ownerId: string): Promise<OwnerDetails> {
  const url = new URL("/api/manager/portal/user-details", window.location.origin);
  url.searchParams.set("ownerId", ownerId);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" && body.error ? body.error : `Failed to load details (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as OwnerDetails;
}

async function saveBetaFeedbackTriage(opts: {
  ownerId: string;
  itemId: string;
  status: string;
  priority: string;
  backlogRef: string;
  promptRef: string;
  exportBucket: string;
  notes: string;
}) {
  const res = await fetch("/api/manager/portal/beta-feedback", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as { ok: true };
}

async function setOverride(opts: { ownerId: string; module: ModuleKey; enabled: boolean }) {
  const res = await fetch("/api/manager/portal/overrides", {
    method: opts.enabled ? "POST" : "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerId: opts.ownerId, module: opts.module }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (HTTP ${res.status})`);
  }
}

async function giftCredits(opts: { ownerId: string; amount: number }) {
  const res = await fetch("/api/manager/portal/credits/gift", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerId: opts.ownerId, amount: opts.amount }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as { ok: true; balance: number };
}

async function setCreditsOnlyOverride(opts: { ownerIds: string[]; creditsOnly: boolean }) {
  const res = await fetch("/api/manager/portal/billing-model", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerIds: opts.ownerIds, creditsOnly: opts.creditsOnly }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as { ok: true; creditsOnly: boolean };
}

async function deletePortalUser(ownerId: string) {
  const res = await fetch(`/api/manager/portal/users/${encodeURIComponent(ownerId)}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as { ok: true };
}

async function restorePortalUser(ownerId: string) {
  const res = await fetch(`/api/manager/portal/users/${encodeURIComponent(ownerId)}`, { method: "PATCH" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as { ok: true };
}

async function seedCreditDemo(opts: { email: string; force?: boolean }) {
  const res = await fetch("/api/manager/portal/seed-credit-demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: opts.email, force: opts.force === true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = typeof body?.details === "string" && body.details ? ` ${body.details}` : "";
    const message = typeof body?.error === "string" && body.error ? `${body.error}${details}` : `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body as { ok: true; skipped?: boolean };
}

export default function PortalOverridesClient() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [creditsFilter, setCreditsFilter] = useState<CreditsFilter>("all");
  const [twilioFilter, setTwilioFilter] = useState<TwilioFilter>("all");
  const [overrideFilter, setOverrideFilter] = useState<OverrideFilter>("all");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("active");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [giftingOwnerId, setGiftingOwnerId] = useState<string | null>(null);
  const [giftAmountByOwner, setGiftAmountByOwner] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [testingOwnerId, setTestingOwnerId] = useState<string | null>(null);
  const [detailsOwnerId, setDetailsOwnerId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([]);
  const [deletePreviewOwnerIds, setDeletePreviewOwnerIds] = useState<string[]>([]);
  const [deletingOwnerIds, setDeletingOwnerIds] = useState<string[]>([]);
  const [restoringOwnerId, setRestoringOwnerId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsByOwnerId, setDetailsByOwnerId] = useState<Record<string, OwnerDetails>>({});
  const [detailsTab, setDetailsTab] = useState<DetailTab>("overview");
  const [creditSeedingOwnerId, setCreditSeedingOwnerId] = useState<string | null>(null);
  const [feedbackSavingKey, setFeedbackSavingKey] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});

  const moduleList = useMemo(() => MODULE_KEYS, []);
  const testingUser = useMemo(() => {
    const id = (testingOwnerId || "").trim();
    if (!id) return null;
    return users.find((user) => user.id === id) ?? null;
  }, [testingOwnerId, users]);
  const details = useMemo(() => {
    const id = (detailsOwnerId || "").trim();
    if (!id) return null;
    return detailsByOwnerId[id] ?? null;
  }, [detailsByOwnerId, detailsOwnerId]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const balance = Math.max(0, Math.floor(user.creditsBalance ?? 0));
      const lifecycle = getLifecycleValue(user);
      if (creditsFilter === "credits-only" && !user.creditsOnlyOverride) return false;
      if (creditsFilter === "subscription" && user.creditsOnlyOverride) return false;
      if (twilioFilter === "on" && !user.twilio?.configured) return false;
      if (twilioFilter === "off" && user.twilio?.configured) return false;
      if (overrideFilter === "enabled" && user.overrides.length === 0) return false;
      if (overrideFilter === "none" && user.overrides.length > 0) return false;
      if (lifecycleFilter !== "all" && lifecycle !== lifecycleFilter) return false;
      if (!balanceFilterMatches(balance, balanceFilter)) return false;
      return true;
    });
  }, [balanceFilter, creditsFilter, lifecycleFilter, overrideFilter, twilioFilter, users]);

  const selectedUser = useMemo(() => {
    const id = (detailsOwnerId || "").trim();
    if (!id) return null;
    return users.find((user) => user.id === id) ?? null;
  }, [detailsOwnerId, users]);

  const selectedOverrides = useMemo(() => {
    if (!selectedUser) return moduleList;
    return [...moduleList].sort((left, right) => {
      const leftEnabled = selectedUser.overrides.includes(left) ? 1 : 0;
      const rightEnabled = selectedUser.overrides.includes(right) ? 1 : 0;
      if (leftEnabled !== rightEnabled) return rightEnabled - leftEnabled;
      return MODULE_LABELS[left].localeCompare(MODULE_LABELS[right]);
    });
  }, [moduleList, selectedUser]);
  const deletePreviewUsers = useMemo(() => {
    const selected = new Set(deletePreviewOwnerIds);
    return users.filter((user) => selected.has(user.id));
  }, [deletePreviewOwnerIds, users]);

  const showLoadingShell = loading && users.length === 0 && !error;
  const statusLabel = showLoadingShell ? "Loading accounts" : loading ? "Refreshing…" : `${filteredUsers.length}${filteredUsers.length === users.length ? "" : ` / ${users.length}`} account${filteredUsers.length === 1 ? "" : "s"}`;
  const hasActiveFilters = creditsFilter !== "all" || twilioFilter !== "all" || overrideFilter !== "all" || balanceFilter !== "all" || lifecycleFilter !== "active";
  const filterSelectButtonClassName = "flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none hover:bg-zinc-50 focus:border-zinc-400";
  const compactSelectButtonClassName = "flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none hover:bg-zinc-50 focus:border-zinc-400";
  const testingAiReceptionistAgentId = testingUser?.voiceAgentIds?.aiReceptionist ?? testingUser?.voiceAgentIds?.profile ?? null;
  const testingOutboundAgentId = testingUser?.voiceAgentIds?.profile ?? null;

  useEffect(() => {
    setSelectedOwnerIds((prev) => prev.filter((ownerId) => users.some((user) => user.id === ownerId)));
    setDeletePreviewOwnerIds((prev) => prev.filter((ownerId) => users.some((user) => user.id === ownerId)));
  }, [users]);

  const selectedOwnerIdSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds]);

  const copyValue = useCallback(async (label: string, value: string | null | undefined) => {
    const safeValue = String(value || "").trim();
    if (!safeValue) {
      toast.error(`No ${label.toLowerCase()} to copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(safeValue);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}`);
    }
  }, [toast]);

  const openDetails = useCallback((ownerId: string) => {
    setDetailsOwnerId(ownerId);
  }, []);

  const openTesting = useCallback((ownerId: string) => {
    setTestingOwnerId(ownerId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const json = await fetchOverrides(q);
        if (cancelled) return;
        setUsers(json.users);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Failed to load overrides");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [q]);

  useEffect(() => {
    if (!detailsOwnerId) return;
    if (!users.some((user) => user.id === detailsOwnerId)) {
      setDetailsOwnerId(null);
    }
  }, [detailsOwnerId, users]);

  useEffect(() => {
    if (!detailsOwnerId) return;
    setDetailsTab("overview");
  }, [detailsOwnerId]);

  useEffect(() => {
    if (!detailsOwnerId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetailsOwnerId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailsOwnerId]);

  useEffect(() => {
    let cancelled = false;
    const ownerId = (detailsOwnerId || "").trim();
    if (!ownerId || detailsByOwnerId[ownerId]) return;

    setDetailsLoading(true);
    setDetailsError(null);
    void (async () => {
      try {
        const json = await fetchOwnerDetails(ownerId);
        if (cancelled) return;
        setDetailsByOwnerId((prev) => ({ ...prev, [ownerId]: json }));
      } catch (cause) {
        if (cancelled) return;
        setDetailsError(cause instanceof Error ? cause.message : "Failed to load details");
      } finally {
        if (cancelled) return;
        setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailsByOwnerId, detailsOwnerId]);

  async function reloadOverrides() {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchOverrides(q);
      setUsers(json.users);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load overrides");
    } finally {
      setLoading(false);
    }
  }

  async function refreshOwnerDetails(ownerId: string) {
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const json = await fetchOwnerDetails(ownerId);
      setDetailsByOwnerId((prev) => ({ ...prev, [ownerId]: json }));
    } catch (cause) {
      setDetailsError(cause instanceof Error ? cause.message : "Failed to load details");
      throw cause;
    } finally {
      setDetailsLoading(false);
    }
  }

  function patchCachedOwner(ownerId: string, patch: (owner: OwnerDetails["owner"]) => OwnerDetails["owner"]) {
    setDetailsByOwnerId((prev) => {
      const existing = prev[ownerId];
      if (!existing) return prev;
      return { ...prev, [ownerId]: { ...existing, owner: patch(existing.owner) } };
    });
  }

  function feedbackDraftFor(item: PortalFeedbackItem): FeedbackDraft {
    return feedbackDrafts[item.id] ?? {
      status: item.triage.status,
      priority: item.triage.priority,
      backlogRef: item.triage.backlogRef ?? "",
      promptRef: item.triage.promptRef ?? "",
      exportBucket: item.triage.exportBucket ?? "",
      notes: item.triage.notes ?? "",
    };
  }

  function setFeedbackDraft(itemId: string, patch: Partial<FeedbackDraft>) {
    setFeedbackDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? { status: "new", priority: "p2", backlogRef: "", promptRef: "", exportBucket: "", notes: "" }),
        ...patch,
      },
    }));
  }

  async function saveFeedback(ownerId: string, item: PortalFeedbackItem) {
    const draft = feedbackDraftFor(item);
    setFeedbackSavingKey(item.id);
    try {
      await saveBetaFeedbackTriage({
        ownerId,
        itemId: item.id,
        status: draft.status,
        priority: draft.priority,
        backlogRef: draft.backlogRef,
        promptRef: draft.promptRef,
        exportBucket: draft.exportBucket,
        notes: draft.notes,
      });
      await refreshOwnerDetails(ownerId);
      toast.success("Feedback triage updated");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to update feedback triage");
    } finally {
      setFeedbackSavingKey(null);
    }
  }

  async function toggle(ownerId: string, module: ModuleKey, enabled: boolean) {
    const key = `${ownerId}:${module}`;
    setSavingKey(key);
    try {
      await setOverride({ ownerId, module, enabled });
      setUsers((prev) => prev.map((user) => {
        if (user.id !== ownerId) return user;
        const next = new Set(user.overrides);
        if (enabled) next.add(module);
        else next.delete(module);
        return { ...user, overrides: Array.from(next) };
      }));
      patchCachedOwner(ownerId, (owner) => {
        const next = new Set(owner.portal.overrides);
        if (enabled) next.add(module);
        else next.delete(module);
        return { ...owner, portal: { ...owner.portal, overrides: Array.from(next) } };
      });
      toast.success(enabled ? `Enabled ${MODULE_LABELS[module]}` : `Disabled ${MODULE_LABELS[module]}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function onGift(ownerId: string) {
    const raw = (giftAmountByOwner[ownerId] ?? "").trim();
    const amount = Number(raw);
    if (!Number.isFinite(amount) || Math.floor(amount) !== amount || amount <= 0) {
      toast.error("Enter a positive whole number of credits");
      return;
    }
    const email = users.find((user) => user.id === ownerId)?.email ?? ownerId;
    if (!window.confirm(`Gift ${amount} credits to ${email}?`)) return;

    setGiftingOwnerId(ownerId);
    try {
      const result = await giftCredits({ ownerId, amount });
      setUsers((prev) => prev.map((user) => (user.id === ownerId ? { ...user, creditsBalance: result.balance } : user)));
      patchCachedOwner(ownerId, (owner) => ({ ...owner, portal: { ...owner.portal, creditsBalance: result.balance } }));
      setGiftAmountByOwner((prev) => ({ ...prev, [ownerId]: "" }));
      toast.success(`Gifted ${amount} credits`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Gift failed");
    } finally {
      setGiftingOwnerId(null);
    }
  }

  async function toggleCreditsOnly(ownerId: string, creditsOnly: boolean) {
    const email = users.find((user) => user.id === ownerId)?.email ?? ownerId;
    const confirmText = creditsOnly ? `Enable credits-only billing for ${email}?` : `Clear the credits-only billing override for ${email}?`;
    if (!window.confirm(confirmText)) return;

    const key = `billingModel:${ownerId}`;
    setSavingKey(key);
    try {
      await setCreditsOnlyOverride({ ownerIds: [ownerId], creditsOnly });
      setUsers((prev) => prev.map((user) => (user.id === ownerId ? { ...user, creditsOnlyOverride: creditsOnly } : user)));
      patchCachedOwner(ownerId, (owner) => ({ ...owner, portal: { ...owner.portal, creditsOnlyOverride: creditsOnly } }));
      toast.success(creditsOnly ? "Credits-only enabled" : "Credits-only cleared (env default)");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function bulkSetCreditsOnly(creditsOnly: boolean) {
    const ownerIds = filteredUsers.map((user) => user.id);
    if (!ownerIds.length) return;
    const confirmText = creditsOnly ? `Enable credits-only billing for ${ownerIds.length} shown account(s)?` : `Clear the credits-only billing override for ${ownerIds.length} shown account(s)?`;
    if (!window.confirm(confirmText)) return;

    const key = `billingModel:bulk:${creditsOnly ? "on" : "off"}`;
    setSavingKey(key);
    try {
      await setCreditsOnlyOverride({ ownerIds, creditsOnly });
      setUsers((prev) => prev.map((user) => (ownerIds.includes(user.id) ? { ...user, creditsOnlyOverride: creditsOnly } : user)));
      setDetailsByOwnerId((prev) => {
        const next = { ...prev };
        for (const ownerId of ownerIds) {
          if (!next[ownerId]) continue;
          next[ownerId] = {
            ...next[ownerId],
            owner: {
              ...next[ownerId].owner,
              portal: {
                ...next[ownerId].owner.portal,
                creditsOnlyOverride: creditsOnly,
              },
            },
          };
        }
        return next;
      });
      toast.success(creditsOnly ? "Credits-only enabled for shown accounts" : "Credits-only cleared for shown accounts");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Bulk update failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function onSeedCreditDemo(ownerId: string) {
    const row = users.find((user) => user.id === ownerId) ?? null;
    const email = String(row?.email || "").trim().toLowerCase();
    if (!email) {
      toast.error("This account is missing an email");
      return;
    }
    setCreditSeedingOwnerId(ownerId);
    try {
      const result = await seedCreditDemo({ email, force: true });
      toast.success(result.skipped ? `Credit demo already present for ${email}` : `Credit demo seeded for ${email}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to seed credit demo");
    } finally {
      setCreditSeedingOwnerId(null);
    }
  }

  const toggleSelectedOwner = useCallback((ownerId: string) => {
    setSelectedOwnerIds((prev) => (prev.includes(ownerId) ? prev.filter((id) => id !== ownerId) : [...prev, ownerId]));
  }, []);

  function openDeletePreview(ownerIds: string[]) {
    const stableIds = Array.from(new Set(ownerIds.map((id) => String(id || "").trim()).filter(Boolean)));
    if (!stableIds.length) return;
    setDeletePreviewOwnerIds(stableIds);
  }

  async function confirmDeleteOwners() {
    const ownerIds = Array.from(new Set(deletePreviewOwnerIds));
    if (!ownerIds.length) return;

    setDeletingOwnerIds(ownerIds);
    try {
      for (const ownerId of ownerIds) {
        await deletePortalUser(ownerId);
      }
      toast.success(ownerIds.length === 1 ? "Account deleted (email freed)." : `${ownerIds.length} accounts deleted (emails freed).`);
      setSelectedOwnerIds((prev) => prev.filter((id) => !ownerIds.includes(id)));
      setDeletePreviewOwnerIds([]);
      if (detailsOwnerId && ownerIds.includes(detailsOwnerId)) {
        setDetailsOwnerId(null);
      }
      setDetailsByOwnerId((prev) => {
        const next = { ...prev };
        for (const ownerId of ownerIds) delete next[ownerId];
        return next;
      });
      await reloadOverrides();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to delete account(s)");
    } finally {
      setDeletingOwnerIds([]);
    }
  }

  async function onRestoreOwner(ownerId: string) {
    setRestoringOwnerId(ownerId);
    try {
      await restorePortalUser(ownerId);
      toast.success("Account restored.");
      setDetailsByOwnerId((prev) => {
        const next = { ...prev };
        delete next[ownerId];
        return next;
      });
      await reloadOverrides();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to restore account");
    } finally {
      setRestoringOwnerId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex-1">
            <div className="text-sm font-semibold text-zinc-900">Account management console</div>
            <div className="mt-1 text-sm text-zinc-600">Find accounts fast by email, name, business, mailbox, phone, or status tags, then open the full account modal when you need to work one deeply.</div>
            <label className="mt-4 block text-xs font-medium text-zinc-500">Search accounts</label>
            <input
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Email, name, business, mailbox, phone, active, inactive, credits-only, twilio…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="inline-flex min-w-36 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700">{statusLabel}</div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => {
                setQ("");
                setCreditsFilter("all");
                setTwilioFilter("all");
                setOverrideFilter("all");
                setBalanceFilter("all");
                setLifecycleFilter("active");
              }}
              disabled={!q && !hasActiveFilters}
            >
              Reset search + filters
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-medium text-zinc-500">Billing<div className="mt-2"><PortalSelectDropdown value={creditsFilter} onChange={setCreditsFilter} options={CREDITS_FILTER_OPTIONS} buttonClassName={filterSelectButtonClassName} /></div></label>
          <label className="text-xs font-medium text-zinc-500">Twilio<div className="mt-2"><PortalSelectDropdown value={twilioFilter} onChange={setTwilioFilter} options={TWILIO_FILTER_OPTIONS} buttonClassName={filterSelectButtonClassName} /></div></label>
          <label className="text-xs font-medium text-zinc-500">Overrides<div className="mt-2"><PortalSelectDropdown value={overrideFilter} onChange={setOverrideFilter} options={OVERRIDE_FILTER_OPTIONS} buttonClassName={filterSelectButtonClassName} /></div></label>
          <label className="text-xs font-medium text-zinc-500">Credit balance<div className="mt-2"><PortalSelectDropdown value={balanceFilter} onChange={setBalanceFilter} options={BALANCE_FILTER_OPTIONS} buttonClassName={filterSelectButtonClassName} /></div></label>
          <label className="text-xs font-medium text-zinc-500">Account status<div className="mt-2"><PortalSelectDropdown value={lifecycleFilter} onChange={setLifecycleFilter} options={LIFECYCLE_FILTER_OPTIONS} buttonClassName={filterSelectButtonClassName} /></div></label>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
            <span className="font-semibold">Bulk billing override:</span>
            <button type="button" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60" onClick={() => void bulkSetCreditsOnly(true)} disabled={savingKey === "billingModel:bulk:on" || loading || filteredUsers.length === 0}>{savingKey === "billingModel:bulk:on" ? "Enabling…" : "Enable for shown accounts"}</button>
            <button type="button" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60" onClick={() => void bulkSetCreditsOnly(false)} disabled={savingKey === "billingModel:bulk:off" || loading || filteredUsers.length === 0}>{savingKey === "billingModel:bulk:off" ? "Clearing…" : "Clear for shown accounts"}</button>
          </div>
          <div className="text-xs text-zinc-500">No raw passwords, auth tokens, or other secrets are shown anywhere in this console.</div>
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
            <span className="font-semibold">Account delete:</span>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => {
                setSelectionMode((prev) => {
                  const next = !prev;
                  if (next) {
                    setDetailsOwnerId(null);
                  } else {
                    setSelectedOwnerIds([]);
                  }
                  return next;
                });
              }}
            >
              {selectionMode ? "Done selecting" : "Select accounts"}
            </button>
            {selectionMode ? (
              <>
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                  onClick={() => setSelectedOwnerIds(filteredUsers.map((user) => user.id))}
                  disabled={filteredUsers.length === 0}
                >
                  Select shown
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                  onClick={() => setSelectedOwnerIds([])}
                  disabled={selectedOwnerIds.length === 0}
                >
                  Clear selection
                </button>
                <div className="inline-flex min-w-20 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700">
                  {selectedOwnerIds.length} selected
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                  onClick={() => openDeletePreview(selectedOwnerIds)}
                  disabled={selectedOwnerIds.length === 0}
                >
                  Delete selected
                </button>
              </>
            ) : null}
          </div>
          <div className="text-xs text-zinc-500">Selection mode keeps the same cards, but card clicks switch to select-only behavior.</div>
        </div>
        {selectionMode ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Click any account card to select it. Selected cards get a red outline. When you are done, click `Delete selected` to review the final list in the pop-up.
          </div>
        ) : null}
        {users.length >= 500 ? <div className="mt-3 text-xs text-amber-700">Loaded the first 500 accounts for responsiveness. Use search and filters to narrow very large account sets before opening detail modals.</div> : null}
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-4">
        {showLoadingShell ? Array.from({ length: 6 }).map((_, index) => <LoadingConsoleRow key={`loading-${index}`} />) : null}
        {!showLoadingShell && filteredUsers.map((user) => (
          <PortalOverrideUserCard
            key={user.id}
            user={user}
            selectionMode={selectionMode}
            isSelected={selectedOwnerIdSet.has(user.id)}
            isDetailsOpen={detailsOwnerId === user.id}
            onToggleSelected={toggleSelectedOwner}
            onOpenDetails={openDetails}
            onOpenTesting={openTesting}
            onCopyValue={copyValue}
          />
        ))}
        {!showLoadingShell && !loading && filteredUsers.length === 0 ? <div className="rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-sm text-zinc-600">No accounts match the current search and filters.</div> : null}
      </div>

      <div className="text-xs text-zinc-500">Tip: Click any account row to open the full management modal without collapsing the account list into a side panel.</div>

      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 md:p-6" onClick={() => setDetailsOwnerId(null)}>
          <div className="w-full max-w-6xl rounded-4xl border border-zinc-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            {detailsLoading && !details ? (
              <div className="p-6"><LoadingDetailPanel /></div>
            ) : (
              <>
                <div className="flex flex-col gap-5 border-b border-zinc-200 p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><div className="truncate text-2xl font-semibold text-brand-ink">{selectedUser.email}</div><button type="button" className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800" onClick={() => void copyValue("Login email", selectedUser.email)}>Copy email</button></div>
                        <div className="mt-1 truncate text-sm text-zinc-600">{selectedUser.businessName ? `${selectedUser.businessName} · ` : ""}{selectedUser.name || "No name"}</div>
                      </div>
                      <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", lifecycleBadgeClassName(getLifecycleValue(selectedUser)))}>{getLifecycleValue(selectedUser)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <button type="button" className="rounded-full bg-zinc-100 px-3 py-1 font-semibold text-zinc-700 hover:bg-zinc-200 disabled:cursor-default disabled:hover:bg-zinc-100" disabled={!selectedUser.businessEmail} onClick={() => void copyValue("Mailbox email", selectedUser.businessEmail)}>{selectedUser.businessEmail ? `Mailbox: ${selectedUser.businessEmail}` : "Mailbox: None"}</button>
                      <button type="button" className="rounded-full bg-zinc-100 px-3 py-1 font-semibold text-zinc-700 hover:bg-zinc-200 disabled:cursor-default disabled:hover:bg-zinc-100" disabled={!selectedUser.phone} onClick={() => void copyValue("Phone", selectedUser.phone)}>{selectedUser.phone ? `Phone: ${selectedUser.phone}` : "Phone: None"}</button>
                      <span className={cn("rounded-full px-3 py-1 font-semibold", selectedUser.twilio?.configured ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600")}>Twilio {selectedUser.twilio?.configured ? "On" : "Off"}</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:max-w-2xl"><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Credits</div><div className="mt-1 text-xl font-semibold text-zinc-900">{Math.max(0, Math.floor(selectedUser.creditsBalance ?? 0))}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Billing</div><div className="mt-1 text-sm font-semibold text-zinc-900">{billingModeLabel(selectedUser)}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Overrides</div><div className="mt-1 text-xl font-semibold text-zinc-900">{selectedUser.overrides.length}</div></div></div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end"><button type="button" className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" onClick={() => setTestingOwnerId(selectedUser.id)}>Testing</button><button type="button" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60" disabled={creditSeedingOwnerId === selectedUser.id} onClick={() => void onSeedCreditDemo(selectedUser.id)}>{creditSeedingOwnerId === selectedUser.id ? "Seeding…" : "Seed credit demo"}</button>{selectedUser.deletedAt ? <button type="button" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60" disabled={restoringOwnerId === selectedUser.id} onClick={() => void onRestoreOwner(selectedUser.id)}>{restoringOwnerId === selectedUser.id ? "Restoring…" : "Restore account"}</button> : <button type="button" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100" onClick={() => openDeletePreview([selectedUser.id])}>Delete account</button>}<button type="button" className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" onClick={() => setDetailsOwnerId(null)}>Close</button></div>
                </div>

                <div className="border-b border-zinc-200 px-6 py-4"><div className="inline-flex w-full flex-wrap items-center gap-2 rounded-2xl bg-zinc-100/70 p-1">{DETAIL_TABS.map((item) => { const active = detailsTab === item.key; return <button key={item.key} type="button" onClick={() => setDetailsTab(item.key)} className={cn("rounded-2xl px-3 py-2 text-sm font-semibold transition", active ? "bg-white text-brand-ink ring-1 ring-zinc-200" : "text-zinc-600 hover:bg-white hover:text-zinc-900")}>{item.label}</button>; })}</div></div>

                <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-5">
                  {detailsError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{detailsError}</div> : null}
                  {detailsLoading && !details ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">Loading account details…</div> : null}
                  {details ? (
                    <div className="space-y-4 pb-2">
                  {detailsTab === "overview" ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="text-sm font-semibold text-zinc-900">Business and contact</div>
                          <div className="mt-3 space-y-2 text-sm text-zinc-700">
                            <div><span className="text-zinc-500">Owner:</span> <span className="font-semibold text-zinc-900">{details.owner.name || "No name"}</span></div>
                            <div className="flex flex-wrap items-center gap-2"><span className="text-zinc-500">Login email:</span> <span className="font-mono text-zinc-900">{details.owner.email}</span><button type="button" className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800" onClick={() => void copyValue("Login email", details.owner.email)}>Copy</button></div>
                            <div><span className="text-zinc-500">Business:</span> <span className="font-semibold text-zinc-900">{details.owner.businessProfile?.businessName || selectedUser.businessName || "Not set"}</span></div>
                            <div className="flex flex-wrap items-center gap-2"><span className="text-zinc-500">Mailbox:</span> <span className="font-mono text-zinc-900">{details.owner.portal.mailboxEmail || "Not set"}</span>{details.owner.portal.mailboxEmail ? <button type="button" className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800" onClick={() => void copyValue("Mailbox email", details.owner.portal.mailboxEmail)}>Copy</button> : null}</div>
                            <div className="flex flex-wrap items-center gap-2"><span className="text-zinc-500">Phone:</span> <span className="font-mono text-zinc-900">{details.owner.portal.phone || "Not set"}</span>{details.owner.portal.phone ? <button type="button" className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800" onClick={() => void copyValue("Phone", details.owner.portal.phone)}>Copy</button> : null}</div>
                            {details.owner.businessProfile?.websiteUrl ? <div className="truncate"><span className="text-zinc-500">Website:</span> <a href={details.owner.businessProfile.websiteUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink hover:underline">{details.owner.businessProfile.websiteUrl}</a></div> : null}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Account summary</div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-zinc-700">
                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Credits</div><div className="mt-1 text-lg font-semibold text-zinc-900">{Math.max(0, Math.floor(details.owner.portal.creditsBalance ?? 0))}</div></div>
                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Billing</div><div className="mt-1 text-sm font-semibold text-zinc-900">{details.owner.portal.creditsOnlyOverride ? "Credits-only" : "Env default"}</div></div>
                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Overrides</div><div className="mt-1 text-lg font-semibold text-zinc-900">{details.owner.portal.overrides.length}</div></div>
                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Invites</div><div className="mt-1 text-sm font-semibold text-zinc-900">{Math.max(0, selectedUser.invitesSentCount ?? 0)} sent</div><div className="text-xs text-zinc-500">{Math.max(0, selectedUser.invitesVerifiedCount ?? 0)} verified · {Math.max(0, selectedUser.inviteCreditsAwardedCount ?? 0)} awarded</div></div>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Integrations</div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className={cn("rounded-full px-2.5 py-1 font-semibold", details.owner.integrations.twilio.configured ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600")}>Twilio {details.owner.integrations.twilio.configured ? "On" : "Off"}</span>
                            {details.owner.integrations.twilio.fromNumberE164 ? <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono font-semibold text-zinc-700">{details.owner.integrations.twilio.fromNumberE164}</span> : null}
                            <span className={cn("rounded-full px-2.5 py-1 font-semibold", details.owner.stripe.connected ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600")}>Stripe {details.owner.stripe.connected ? "Connected" : "Off"}</span>
                            <span className={cn("rounded-full px-2.5 py-1 font-semibold", details.owner.integrations.salesReporting.connectedProviders.length ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600")}>Sales reporting {details.owner.integrations.salesReporting.connectedProviders.length ? "On" : "Off"}</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Brand profile</div>
                          <div className="mt-3 space-y-2 text-sm text-zinc-700">
                            <div><span className="text-zinc-500">Industry:</span> {details.owner.businessProfile?.industry || "Not set"}</div>
                            <div><span className="text-zinc-500">Model:</span> {details.owner.businessProfile?.businessModel || "Not set"}</div>
                            <div><span className="text-zinc-500">Target:</span> {details.owner.businessProfile?.targetCustomer || "Not set"}</div>
                            <div><span className="text-zinc-500">Voice:</span> {details.owner.businessProfile?.brandVoice || "Not set"}</div>
                            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-zinc-500"><span className="inline-flex items-center gap-2"><ColorSwatch hex={details.owner.businessProfile?.brandPrimaryHex} />Primary</span><span className="inline-flex items-center gap-2"><ColorSwatch hex={details.owner.businessProfile?.brandAccentHex} />Accent</span><span className="inline-flex items-center gap-2"><ColorSwatch hex={details.owner.businessProfile?.brandTextHex} />Text</span></div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {detailsTab === "billing" ? (
                    <>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-end justify-between gap-3"><div><div className="text-xs font-medium text-zinc-500">Credit balance</div><div className="mt-1 text-3xl font-bold text-brand-ink">{Math.max(0, Math.floor(selectedUser.creditsBalance ?? 0))}</div></div><div className="text-right text-xs text-zinc-500">Protected confirmation is required for billing and credit changes.</div></div></div>
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-900">Credits-only billing</div><div className="mt-1 text-xs text-zinc-500">Affects the shared /portal experience.</div></div>{(() => { const enabled = Boolean(selectedUser.creditsOnlyOverride); const key = `billingModel:${selectedUser.id}`; const busy = savingKey === key; return <div className="inline-flex items-center gap-2 text-sm text-zinc-700"><ToggleSwitch checked={enabled} disabled={busy} accent="ink" ariaLabel="Credits-only billing override" onChange={(checked) => void toggleCreditsOnly(selectedUser.id, checked)} /><span className={enabled ? "font-semibold text-emerald-700" : "text-zinc-500"}>{busy ? "Saving…" : enabled ? "On" : "Off"}</span></div>; })()}</div></div>
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-sm font-semibold text-zinc-900">Gift credits</div><div className="mt-1 text-xs text-zinc-500">Confirmation is required before credits are added.</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400" placeholder="Amount" inputMode="numeric" value={giftAmountByOwner[selectedUser.id] ?? ""} onChange={(event) => setGiftAmountByOwner((prev) => ({ ...prev, [selectedUser.id]: event.target.value }))} disabled={giftingOwnerId === selectedUser.id} /><button type="button" className="h-11 rounded-xl bg-brand-ink px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60" onClick={() => void onGift(selectedUser.id)} disabled={giftingOwnerId === selectedUser.id}>{giftingOwnerId === selectedUser.id ? "Gifting…" : "Gift credits"}</button></div></div>
                    </>
                  ) : null}

                  {detailsTab === "overrides" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-900">Service overrides</div><div className="mt-1 text-xs text-zinc-500">Enabled modules are grouped first for faster scan and comparison.</div></div><div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">{selectedUser.overrides.length} enabled</div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{selectedOverrides.map((module) => { const enabled = selectedUser.overrides.includes(module); const key = `${selectedUser.id}:${module}`; const busy = savingKey === key; return <div key={module} className={cn("rounded-2xl border px-3 py-2.5", enabled ? "border-emerald-200 bg-emerald-50/60" : "border-zinc-200 bg-zinc-50")}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-zinc-900">{MODULE_LABELS[module]}</div><div className="mt-0.5 text-[11px] text-zinc-500">{busy ? "Saving…" : enabled ? "Enabled override" : "Env or billing controlled"}</div></div><ToggleSwitch checked={enabled} disabled={busy} ariaLabel={`Toggle ${MODULE_LABELS[module]}`} onChange={(checked) => void toggle(selectedUser.id, module, checked)} /></div></div>; })}</div></div>
                  ) : null}

                  {detailsTab === "access" ? (
                    <>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="text-sm font-semibold text-zinc-900">Safe access metadata</div><div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-zinc-700"><div><span className="text-zinc-500">Login email:</span> <span className="font-mono text-zinc-900">{details.owner.email}</span></div><div><span className="text-zinc-500">Account type:</span> <span className="font-semibold text-zinc-900">{details.owner.role}</span></div><div><span className="text-zinc-500">Time zone:</span> {details.owner.timeZone || "Not set"}</div><div><span className="text-zinc-500">Lifecycle:</span> <span className="font-semibold text-zinc-900">{getLifecycleValue(selectedUser)}</span></div><div><span className="text-zinc-500">Created:</span> {formatIso(details.owner.createdAt)}</div><div><span className="text-zinc-500">Updated:</span> {formatIso(details.owner.updatedAt)}</div><div><span className="text-zinc-500">Last activity:</span> {details.owner.usage.lastActivityAt ? formatIso(details.owner.usage.lastActivityAt) : "No recent activity"}</div><div><span className="text-zinc-500">Mailbox:</span> {details.owner.portal.mailboxEmail ? "Configured" : "Not configured"}</div></div></div>
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-sm font-semibold text-zinc-900">Credential status</div><div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-zinc-700"><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Mailbox</div><div className="mt-1 font-semibold text-zinc-900">{details.owner.portal.mailboxEmail ? "Configured" : "Missing"}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Phone</div><div className="mt-1 font-semibold text-zinc-900">{details.owner.portal.phone ? "On file" : "Missing"}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Twilio</div><div className="mt-1 font-semibold text-zinc-900">{details.owner.integrations.twilio.configured ? "Configured" : "Not configured"}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Stripe</div><div className="mt-1 font-semibold text-zinc-900">{details.owner.stripe.connected ? "Connected" : "Not connected"}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">Profile voice agent</div><div className="mt-1 font-semibold text-zinc-900">{details.owner.ai.voiceAgentIds.profile ? "Configured" : "Missing"}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs font-medium text-zinc-500">AI receptionist</div><div className="mt-1 font-semibold text-zinc-900">{details.owner.ai.voiceAgentIds.aiReceptionist ? "Configured" : "Missing"}</div></div></div><div className="mt-3 text-xs text-zinc-500">Passwords, auth tokens, and raw secrets are intentionally hidden from this console.</div></div>
                    </>
                  ) : null}

                  {detailsTab === "activity" ? (
                    <>
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-sm font-semibold text-zinc-900">Usage snapshot</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-700"><div><div className="text-xs text-zinc-500">Blog generations</div><div className="font-semibold text-zinc-900">{details.owner.usage.blog.generationEventsLast30}</div></div><div><div className="text-xs text-zinc-500">Newsletter sends</div><div className="font-semibold text-zinc-900">{details.owner.usage.newsletter.sentLast30}</div></div><div><div className="text-xs text-zinc-500">Newsletter failures</div><div className={details.owner.usage.newsletter.failedLast30 ? "font-semibold text-amber-800" : "font-semibold text-zinc-900"}>{details.owner.usage.newsletter.failedLast30}</div></div><div><div className="text-xs text-zinc-500">Lead scraping runs</div><div className="font-semibold text-zinc-900">{details.owner.usage.leadScraping.runsLast30}</div></div><div><div className="text-xs text-zinc-500">Bookings created</div><div className="font-semibold text-zinc-900">{details.owner.usage.booking.bookingsCreatedLast30}</div></div><div><div className="text-xs text-zinc-500">Upcoming bookings</div><div className="font-semibold text-zinc-900">{details.owner.usage.booking.bookingsUpcoming}</div></div><div><div className="text-xs text-zinc-500">Hours saved</div><div className="font-semibold text-zinc-900">{formatHours(details.owner.usage.hoursSaved.secondsLast30)}</div></div><div><div className="text-xs text-zinc-500">Last activity</div><div className="font-semibold text-zinc-900">{details.owner.usage.lastActivityAt ? formatIso(details.owner.usage.lastActivityAt) : "N/A"}</div></div></div></div>
                      {details.owner.usage.portalEngagement?.recentActivity?.length ? <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-sm font-semibold text-zinc-900">Recent portal activity</div><div className="mt-1 text-xs text-zinc-500">Grouped into continuous sessions per page.</div><div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="space-y-2">{groupRecentActivity(details.owner.usage.portalEngagement.recentActivity, { take: 200 }).map((session, index) => <div key={`${session.key}-${session.endMs}-${index}`} className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700"><div className="min-w-0"><div className="truncate font-mono text-zinc-900">{session.key}</div><div className="mt-0.5 text-[11px] text-zinc-500">{new Date(session.startMs).toLocaleString()} → {new Date(session.endMs).toLocaleString()}</div></div><div className="shrink-0 font-semibold text-zinc-700">{formatDurationShort(session.seconds)}</div></div>)}</div></div></div> : null}
                    </>
                  ) : null}

                  {detailsTab === "diagnostics" ? (
                    details.owner.usage.portalDiagnostics ? (
                      <>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-900">Diagnostics overview</div><div className="mt-1 text-sm text-zinc-600">Manager-side failures and beta feedback for this account.</div></div><div className="text-right text-xs text-zinc-500">{details.owner.usage.portalDiagnostics.lastSeenAt ? formatIso(details.owner.usage.portalDiagnostics.lastSeenAt) : "No diagnostics yet"}</div></div><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5"><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Action failures</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.actionFailureCount}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Runtime errors</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.runtimeErrorCount}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Promise failures</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.unhandledRejectionCount}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Resource failures</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.resourceErrorCount}</div></div><div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-500">Bug reports</div><div className="mt-1 text-lg font-bold text-brand-ink">{details.owner.usage.portalDiagnostics.bugReports.count}</div></div></div></div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-sm font-semibold text-zinc-900">Recent diagnostics</div>{details.owner.usage.portalDiagnostics.recentEvents.length ? <div className="mt-3 space-y-3">{details.owner.usage.portalDiagnostics.recentEvents.slice(0, 10).map((item) => <div key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 font-semibold", portalDiagnosticKindClassName(item.kind))}>{portalDiagnosticKindLabel(item.kind)}</span>{item.area ? <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-zinc-700">{item.area.replace(/_/g, " ")}</span> : null}</div><div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{item.message}</div>{item.path ? <div className="mt-2 font-mono text-[11px] text-zinc-500">{item.path}</div> : null}</div><div className="shrink-0 text-right text-[11px] text-zinc-500">{formatIso(item.lastSeenAtIso || item.createdAtIso)}</div></div></div>)}</div> : <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">No diagnostics events have been recorded for this account yet.</div>}</div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-900">Beta feedback triage</div><div className="mt-1 text-xs text-zinc-500">Review, prioritize, and annotate recent account feedback.</div></div><div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">{details.owner.usage.portalDiagnostics.betaFeedback.count} items</div></div>{details.owner.usage.portalDiagnostics.betaFeedback.recentItems.length ? <div className="mt-3 space-y-4">{details.owner.usage.portalDiagnostics.betaFeedback.recentItems.map((item) => { const draft = feedbackDraftFor(item); const busy = feedbackSavingKey === item.id; return <div key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", feedbackSeverityClassName(item.severity))}>{item.severity || "normal"}</span><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-zinc-700">{feedbackCategoryLabel(item.category)}</span><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", feedbackStatusClassName(draft.status))}>{draft.status}</span></div><div className="mt-2 text-sm font-semibold text-zinc-900">{item.title}</div><div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{item.message}</div>{item.expected ? <div className="mt-2 text-xs text-zinc-500">Expected: {item.expected}</div> : null}</div><div className="text-right text-[11px] text-zinc-500">{formatIso(item.createdAtIso)}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-zinc-500">Status<div className="mt-1"><PortalSelectDropdown value={draft.status} onChange={(next) => setFeedbackDraft(item.id, { status: next })} options={FEEDBACK_STATUS_OPTIONS} buttonClassName={compactSelectButtonClassName} /></div></label><label className="text-xs font-medium text-zinc-500">Priority<div className="mt-1"><PortalSelectDropdown value={draft.priority} onChange={(next) => setFeedbackDraft(item.id, { priority: next })} options={FEEDBACK_PRIORITY_OPTIONS} buttonClassName={compactSelectButtonClassName} /></div></label><label className="text-xs font-medium text-zinc-500">Backlog ref<input className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400" value={draft.backlogRef} onChange={(event) => setFeedbackDraft(item.id, { backlogRef: event.target.value })} /></label><label className="text-xs font-medium text-zinc-500">Prompt ref<input className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400" value={draft.promptRef} onChange={(event) => setFeedbackDraft(item.id, { promptRef: event.target.value })} /></label><label className="text-xs font-medium text-zinc-500 sm:col-span-2">Export bucket<input className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400" value={draft.exportBucket} onChange={(event) => setFeedbackDraft(item.id, { exportBucket: event.target.value })} /></label><label className="text-xs font-medium text-zinc-500 sm:col-span-2">Notes<textarea className="mt-1 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400" value={draft.notes} onChange={(event) => setFeedbackDraft(item.id, { notes: event.target.value })} /></label></div><div className="mt-3 flex justify-end"><button type="button" className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60" disabled={busy} onClick={() => void saveFeedback(selectedUser.id, item)}>{busy ? "Saving…" : "Save triage"}</button></div></div>; })}</div> : <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">No beta feedback has been submitted for this account yet.</div>}</div>
                      </>
                    ) : <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">Diagnostics are not available for this account yet.</div>
                  ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {deletePreviewUsers.length ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onClick={() => deletingOwnerIds.length === 0 && setDeletePreviewOwnerIds([])}>
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">
                  {deletePreviewUsers.length === 1 ? "Delete portal account" : `Delete ${deletePreviewUsers.length} portal accounts`}
                </div>
                <div className="mt-1 text-sm text-zinc-600">This archives the account quietly in the database, removes it from the normal surface, and frees the email so a new signup can reuse it.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => setDeletePreviewOwnerIds([])}
                disabled={deletingOwnerIds.length > 0}
              >
                Close
              </button>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-medium text-zinc-500">Selected accounts</div>
                <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-zinc-200 bg-white">
                  {deletePreviewUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-zinc-900">{user.email}</div>
                        <div className="truncate text-xs text-zinc-500">{user.name || "No name"}</div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 disabled:opacity-60"
                        onClick={() => setDeletePreviewOwnerIds((prev) => prev.filter((id) => id !== user.id))}
                        disabled={deletingOwnerIds.length > 0}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                  onClick={() => setDeletePreviewOwnerIds([])}
                  disabled={deletingOwnerIds.length > 0}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                  onClick={() => void confirmDeleteOwners()}
                  disabled={deletePreviewUsers.length === 0 || deletingOwnerIds.length > 0}
                >
                  {deletingOwnerIds.length > 0 ? "Deleting…" : deletePreviewUsers.length === 1 ? "Delete account" : `Delete ${deletePreviewUsers.length} accounts`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="text-xs text-zinc-500">Tip: Turning a module on here unlocks the matching service in /portal and the portal APIs as if Stripe was paid.</div>

      {testingUser ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5"><div className="min-w-0"><div className="text-sm font-semibold text-zinc-900">AI testing</div><div className="mt-1 truncate text-sm text-zinc-600">{testingUser.businessName ? `${testingUser.businessName} · ` : ""}{testingUser.email}</div></div><button type="button" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" onClick={() => setTestingOwnerId(null)}>Close</button></div>
            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div><div className="text-sm font-semibold text-zinc-900">AI Receptionist widget</div><div className="mt-1 text-xs text-zinc-500">Uses the account’s AI Receptionist voice agent ID (falls back to Profile if missing).</div><div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-600">Voice agent ID: <span className="font-mono text-zinc-800">{testingAiReceptionistAgentId ?? "N/A"}</span></div><div className="mt-3"><ElevenLabsConvaiWidget agentId={testingAiReceptionistAgentId} /></div></div></div>
              <div><div className="text-sm font-semibold text-zinc-900">AI Outbound widget</div><div className="mt-1 text-xs text-zinc-500">Uses the account’s Profile voice agent ID.</div><div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="text-xs text-zinc-600">Voice agent ID: <span className="font-mono text-zinc-800">{testingOutboundAgentId ?? "N/A"}</span></div><div className="mt-3"><ElevenLabsConvaiWidget agentId={testingOutboundAgentId} /></div></div></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
