"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  IconActiveFunnels,
  IconForms,
  IconSidebarSettings,
  PortalSidebarNavButton,
  portalSidebarBorderButtonActiveClass,
  portalSidebarBorderButtonBaseClass,
  portalSidebarBorderButtonInactiveClass,
  portalSidebarIconToneClassForSlug,
  portalSidebarIconToneNeutralClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { AppConfirmModal, AppModal } from "@/components/AppModal";
import { PortalBackToOnboardingLink } from "@/components/PortalBackToOnboardingLink";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { useToast } from "@/components/ToastProvider";
import { IconCopy, IconEdit } from "@/app/portal/PortalIcons";
import {
  FUNNEL_BUTTON_MOTION_CLASS,
  FUNNEL_BUTTON_RAISE_CLASS,
  FUNNEL_BUTTON_SUBTLE_RAISE_CLASS,
} from "@/components/funnel/funnelButtonMotion";
import { hostedFunnelPath, hostedFormPath } from "@/lib/publicHostedKeys";
import { toRuntimeHostedUrl } from "@/lib/publicHostedOrigin";
import { CreditFormTemplatePreview } from "@/components/CreditFormTemplatePreview";

import { CREDIT_FORM_TEMPLATES, coerceCreditFormTemplateKey, getCreditFormTemplate, type CreditFormTemplateKey } from "@/lib/creditFormTemplates";
import { CREDIT_FORM_THEMES, coerceCreditFormThemeKey, getCreditFormTheme, type CreditFormThemeKey } from "@/lib/creditFormThemes";
import { coerceCreditFunnelTemplateKey, getCreditFunnelTemplate, type CreditFunnelTemplateKey } from "@/lib/creditFunnelTemplates";
import { coerceCreditFunnelThemeKey, type CreditFunnelThemeKey } from "@/lib/creditFunnelThemes";

import { buildSuggestedFunnelNaming, inferFunnelPageIntentProfile, type FunnelPageIntentType, type FunnelPageMediaMode } from "@/lib/funnelPageIntent";
import { resolveBusinessProfileRuntimeSnapshot } from "@/lib/businessProfileRuntimeSnapshot";
import { decideFunnelInitialization } from "@/lib/funnelStencilPlanner";
import { PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

type CreditFunnel = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  assignedDomain?: string | null;
};

type CreditForm = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
};

type CreditDomain = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED";
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rootMode?: "DISABLED" | "DIRECTORY" | "REDIRECT";
  rootFunnelSlug?: string | null;
};

type RootMode = "DISABLED" | "DIRECTORY" | "REDIRECT";

type TabKey = "funnels" | "forms" | "settings";

type VercelVerificationRecord = {
  type: string;
  host: string;
  value: string;
};

type StripeIntegrationStatus = {
  configured: boolean;
  accountId: string | null;
  connectedAtIso: string | null;
};

type CreateFunnelInterviewStage = "business" | "audience" | "conversion";

type FunnelBuilderSettings = {
  metaPixelId: string | null;
  createFunnelDraft: FunnelCreateDraft | null;
};

type FormSettingsDialog = {
  id: string;
  name: string;
  slug: string;
  status: CreditForm["status"];
} | null;

type FunnelCreateBusinessProfileSummary = {
  businessName: string;
  industry: string;
  businessModel: string;
  targetCustomer: string;
  brandVoice: string;
  businessContext: string;
  primaryGoals: string[];
  brandPrimaryHex?: string;
  brandSecondaryHex?: string;
  brandAccentHex?: string;
  brandTextHex?: string;
};

type CreateSpeechRecognitionAlternativeLike = {
  transcript: string;
};

type CreateSpeechRecognitionResultLike = {
  length: number;
  isFinal: boolean;
  [index: number]: CreateSpeechRecognitionAlternativeLike;
};

type CreateSpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<CreateSpeechRecognitionResultLike>;
};

type CreateSpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type CreateSpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: CreateSpeechRecognitionEventLike) => void) | null;
  onerror: ((event: CreateSpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type CreateSpeechRecognitionCtor = new () => CreateSpeechRecognitionLike;

type FunnelCreateDraft = {
  v: 1;
  updatedAt: string;
  stage: CreateFunnelInterviewStage;
  slug: string;
  name: string;
  pageType: FunnelPageIntentType;
  primaryCta: string;
  heroAssetMode: FunnelPageMediaMode;
  audience: string;
  offer: string;
  goal: string;
  shellFrameId: string;
  companyContext: string;
  qualificationFields: string;
  preferCustomMode: boolean;
};

const FUNNEL_CREATE_CONTEXT_PROMPTS = [
  "What problem do we solve, and why does it matter right now?",
  "What makes this offer easier to say yes to than the obvious alternatives?",
  "What should a qualified buyer believe before they click the CTA?",
  "What should happen internally after someone converts?",
];
const FUNNEL_CREATE_STAGE_ORDER: CreateFunnelInterviewStage[] = ["business", "audience", "conversion"];

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const builderActionMenuLabelClass = "px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500";
const builderActionMenuSectionClass = "px-2 pb-2";
const builderActionMenuItemClass =
  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-900 transition hover:bg-white/55";
const builderActionMenuIconClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]";
const builderActionMenuTitleClass = "min-w-0 flex-1 truncate";
const builderActionMenuMutedClass = "text-zinc-500 hover:bg-transparent";
const builderActionMenuSuccessClass = "text-emerald-700";
const builderActionMenuDangerClass = "text-red-600";
const builderActionMenuSeparatorClass = "my-2 h-px bg-white/55";

function normalizeBusinessProfileGoals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

function buildFunnelCreateBusinessContextSeed(summary: FunnelCreateBusinessProfileSummary | null): string {
  if (!summary) return "";
  const lines = [
    summary.businessName ? `Business: ${summary.businessName}` : "",
    summary.industry ? `Industry: ${summary.industry}` : "",
    summary.businessModel ? `Model: ${summary.businessModel}` : "",
    summary.targetCustomer ? `Audience: ${summary.targetCustomer}` : "",
    summary.brandVoice ? `Voice: ${summary.brandVoice}` : "",
    summary.businessContext ? `Context: ${summary.businessContext}` : "",
    summary.primaryGoals.length ? `Goals: ${summary.primaryGoals.join("; ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function getCreateSpeechRecognitionCtor(source: Window & typeof globalThis): CreateSpeechRecognitionCtor | null {
  const scoped = source as Window & typeof globalThis & {
    SpeechRecognition?: CreateSpeechRecognitionCtor;
    webkitSpeechRecognition?: CreateSpeechRecognitionCtor;
  };

  return scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition ?? null;
}

function friendlyCreateSpeechError(event: CreateSpeechRecognitionErrorEventLike) {
  const code = String(event.error || "").trim().toLowerCase();
  if (code === "not-allowed" || code === "service-not-allowed") return "Microphone permission was denied.";
  if (code === "no-speech") return "No speech was detected. Try again and speak a little closer to the mic.";
  if (code === "audio-capture") return "This browser could not access a working microphone.";
  if (code === "network") return "Speech recognition hit a network issue. Try again.";
  return "Speech recognition stopped unexpectedly.";
}

function parseFunnelCreateDraft(raw: unknown): FunnelCreateDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const parsed = raw as Partial<FunnelCreateDraft>;
  const stage = typeof parsed.stage === "string" && FUNNEL_CREATE_STAGE_ORDER.includes(parsed.stage as CreateFunnelInterviewStage)
    ? (parsed.stage as CreateFunnelInterviewStage)
    : "business";
  return {
    v: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    stage,
    slug: typeof parsed.slug === "string" ? parsed.slug : "",
    name: typeof parsed.name === "string" ? parsed.name : "",
    pageType: typeof parsed.pageType === "string" ? (parsed.pageType as FunnelPageIntentType) : "lead-capture",
    primaryCta: typeof parsed.primaryCta === "string" ? parsed.primaryCta : "",
    heroAssetMode: typeof parsed.heroAssetMode === "string" ? (parsed.heroAssetMode as FunnelPageMediaMode) : "auto",
    audience: typeof parsed.audience === "string" ? parsed.audience : "",
    offer: typeof parsed.offer === "string" ? parsed.offer : "",
    goal: typeof parsed.goal === "string" ? parsed.goal : "",
    shellFrameId: typeof parsed.shellFrameId === "string" ? parsed.shellFrameId : "",
    companyContext: typeof parsed.companyContext === "string" ? parsed.companyContext : "",
    qualificationFields: typeof parsed.qualificationFields === "string" ? parsed.qualificationFields : "",
    preferCustomMode: parsed.preferCustomMode === true,
  };
}

function formatRelativeAutosaveLabel(value: string | null) {
  if (!value) return "Draft sync is ready for this workspace.";
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return "Draft sync is ready for this workspace.";
  const deltaMs = Date.now() - stamp;
  if (deltaMs < 60_000) return "Synced just now to your workspace.";
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) return `Synced ${minutes}m ago to your workspace.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago to your workspace.`;
  const days = Math.round(hours / 24);
  return `Synced ${days}d ago to your workspace.`;
}

function funnelStatusLabel(
  f: { status: "DRAFT" | "ACTIVE" | "ARCHIVED"; assignedDomain?: string | null },
  assignedDomainStatus: "PENDING" | "VERIFIED" | null,
) {
  if (f.status === "ARCHIVED") return "ARCHIVED";
  if (f.status !== "ACTIVE") return "DRAFT";
  if (f.assignedDomain) return assignedDomainStatus === "VERIFIED" ? "LIVE" : "PENDING";
  return "LIVE";
}

function statusPillClass(label: string) {
  const s = String(label || "").trim().toUpperCase();
  if (s === "LIVE" || s === "ACTIVE") return "border-green-200 bg-green-50 text-green-800";
  if (s === "PENDING") return "border-amber-200 bg-amber-50 text-amber-900";
  if (s === "ARCHIVED") return "border-zinc-200 bg-zinc-50 text-zinc-500";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 7.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zm0 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zm0 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z" />
    </svg>
  );
}

function normalizeSlug(raw: string) {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
  return cleaned;
}

function normalizeFunnelBuilderError(action: string, error: unknown, status?: number) {
  const raw = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "";
  const message = raw.trim();
  const normalized = message.toLowerCase();

  if (status === 401) return "Your session ended. Sign in again and try once more.";
  if (status === 403) return "You do not have access to do that from this builder session.";
  if (status === 404) {
    if (action.includes("form")) return "That form could not be found. It may have been deleted or you may no longer have access.";
    if (action.includes("domain")) return "That domain record could not be found anymore.";
    return "That funnel item could not be found. It may have been deleted or you may no longer have access.";
  }
  if (status === 409 || normalized.includes("already exists")) {
    if (normalized.includes("slug") || action.includes("create") || action.includes("domain")) {
      return "That path is already in use. Choose a different one and try again.";
    }
  }
  if (status === 402 || normalized.includes("more credits")) {
    return "You need more credits before this builder action can continue.";
  }
  if (status === 429 || normalized.includes("too many") || normalized.includes("rate limit")) {
    return "That happened too quickly. Wait a moment, then try again.";
  }
  if (normalized.includes("invalid slug")) return "Use letters, numbers, and dashes for the path.";
  if (normalized.includes("invalid name")) return "Enter a clearer name and try again.";
  if (normalized.includes("invalid domain")) return "Enter a valid domain before saving.";
  if (normalized.includes("verification failed")) return "We could not verify that domain yet. Check the DNS records and try again.";
  if (normalized.includes("stripe is not connected")) return "Connect Stripe before using product-linked funnel actions.";
  if (normalized.includes("failed to load")) return `We couldn't ${action} right now. Refresh and try again.`;
  if (normalized.includes("failed to save") || normalized.includes("failed to update") || normalized.includes("failed to delete")) {
    return `We couldn't ${action} right now. Please try again.`;
  }
  if (normalized.includes("create failed") || normalized.includes("failed to create")) {
    return `We couldn't ${action} right now. Please try again.`;
  }
  if (normalized.includes("enter a valid slug")) return "Use letters, numbers, and dashes for the path.";
  if (normalized.includes("enter the service, offer, or funnel concept first")) {
    return "Describe the offer or service first so the builder can create the funnel.";
  }
  if (!message) return `We couldn't ${action} right now. Please try again.`;
  return message;
}

async function readFunnelBuilderJson<T>(res: Response, action: string): Promise<T> {
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json || json.ok !== true) {
    throw new Error(normalizeFunnelBuilderError(action, json?.error || "", res.status));
  }
  return json as T;
}

function buildPrimaryCtaSuggestions(pageType: FunnelPageIntentType, current: string) {
  const presets: Record<FunnelPageIntentType, string[]> = {
    landing: ["Get started", "See how it works", "Talk to our team"],
    "lead-capture": ["Get the offer", "Get the guide", "Request a quote"],
    booking: ["Book a call", "Schedule a consultation", "Talk to our team"],
    sales: ["Buy now", "See pricing", "Get started"],
    checkout: ["Complete purchase", "Continue to payment", "Secure my order"],
    "thank-you": ["See next steps", "Keep going", "Back to dashboard"],
    application: ["Apply now", "Start application", "Check eligibility"],
    webinar: ["Reserve your seat", "Save my spot", "Register now"],
    home: ["Get started", "See how it works", "Talk to our team"],
    custom: ["Get started", "Talk to our team", "See next steps"],
  };

  const out = [...presets[pageType]];
  const nextCurrent = String(current || "").trim();
  if (nextCurrent && !out.includes(nextCurrent)) out.unshift(nextCurrent);
  return out;
}

function defaultFunnelGoalForCreate(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "Turn qualified visitors into booked calls";
  if (pageType === "sales") return "Move qualified visitors from interest to purchase";
  if (pageType === "checkout") return "Finish the purchase with minimal drop-off";
  if (pageType === "lead-capture") return "Convert interest into a lead with a clear value exchange";
  if (pageType === "application") return "Filter for fit and collect strong applications";
  if (pageType === "webinar") return "Turn interest into webinar registrations";
  if (pageType === "thank-you") return "Confirm the action and move the visitor to the right next step";
  if (pageType === "home") return "Route visitors into the right funnel path";
  return "Clarify the page goal and move the visitor to the next step";
}

const FUNNEL_PAGE_TYPE_OPTIONS: Array<{ value: FunnelPageIntentType; label: string; hint: string }> = [
  { value: "lead-capture", label: "Lead capture", hint: "Collect contact details around a clear value exchange." },
  { value: "booking", label: "Booking", hint: "Turn qualified visitors into booked calls or appointments." },
  { value: "sales", label: "Sales", hint: "Move visitors from evaluation into purchase." },
  { value: "webinar", label: "Webinar", hint: "Drive registrations for an event or live training." },
  { value: "application", label: "Application", hint: "Qualify visitors through a staged intake or screening flow." },
  { value: "home", label: "Homepage", hint: "Route visitors into the right offer or funnel path." },
  { value: "custom", label: "Custom", hint: "Start broad when the funnel job still needs to be clarified." },
];

function formatInitializationConfidence(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  return "Needs clarification";
}

function formatInitializationActionLabel(decision: ReturnType<typeof decideFunnelInitialization> | null) {
  if (!decision) return "Create funnel";
  if (decision.mode === "stencil" && decision.label) return `Create with ${decision.label}`;
  return "Create custom funnel";
}

function pageTypeFromStencilId(stencilId: string): FunnelPageIntentType {
  if (stencilId === "lead_capture") return "lead-capture";
  if (stencilId === "multi_step") return "application";
  if (stencilId === "tripwire") return "sales";
  if (
    stencilId === "booking" ||
    stencilId === "sales" ||
    stencilId === "webinar"
  ) {
    return stencilId;
  }
  return "custom";
}

function deriveDnsHostLabel(domain: string): string {
  const s = String(domain || "").trim().toLowerCase();
  if (!s) return "@";
  if (s.startsWith("www.")) return "www";

  const parts = s.split(".").filter(Boolean);
  if (parts.length <= 2) return "@";
  return parts.slice(0, -2).join(".") || "@";
}

function isLikelyApexDomain(domain: string): boolean {
  const s = String(domain || "").trim().toLowerCase();
  if (!s) return true;
  if (s.startsWith("www.")) return false;
  const parts = s.split(".").filter(Boolean);
  return parts.length <= 2;
}

function coercePlatformTargetHost(): string | null {
  const explicit = (process.env.NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET_HOST || "").trim();
  if (explicit) return explicit;

  // Default: Vercel target for custom domains.
  return "cname.vercel-dns.com";
}

function extractVercelVerificationRecords(raw: unknown): VercelVerificationRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .map((v) => {
      const type = typeof v?.type === "string" ? v.type.trim() : "";
      const host = typeof v?.domain === "string" ? v.domain.trim() : "";
      const value = typeof v?.value === "string" ? v.value.trim() : "";
      if (!type || !host || !value) return null;
      return { type, host, value };
    })
    .filter(Boolean) as VercelVerificationRecord[];
}

function deriveVerificationHostLabels(recordHost: string, apexDomain: string): { display: string; full: string } {
  const full = String(recordHost || "").trim().replace(/\.+$/, "");
  const domain = String(apexDomain || "").trim().replace(/\.+$/, "");
  if (!full) return { display: "", full: "" };
  if (!domain) return { display: full, full };

  const fullLower = full.toLowerCase();
  const domainLower = domain.toLowerCase();
  if (fullLower === domainLower) return { display: "@", full };

  const suffix = `.${domainLower}`;
  if (fullLower.endsWith(suffix) && full.length > domain.length + 1) {
    const prefix = full.slice(0, full.length - (domain.length + 1));
    return { display: prefix || "@", full };
  }

  return { display: full, full };
}

export function FunnelBuilderClient(props: { initialTab?: TabKey } = {}) {
  const { initialTab } = props;
  const pathname = usePathname();
  const router = useRouter();
  const basePath = pathname === "/credit" || pathname.startsWith("/credit/") ? "/credit" : "/portal";
  const portalVariant: PortalVariant = basePath === "/credit" ? "credit" : "portal";

  const toast = useToast();

  const [tab, setTab] = useState<TabKey>(initialTab ?? "funnels");

  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
  }, [initialTab]);

  const setSidebarOverride = useSetPortalSidebarOverride();
  const funnelSidebar = useMemo(() => {
    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>Funnel Builder</div>
          <div className={portalSidebarSectionStackClass}>
            {([
              { key: "funnels", label: "Active Funnels" },
              { key: "forms", label: "Forms" },
              { key: "settings", label: "Settings" },
            ] as const).map((item) => (
              <PortalSidebarNavButton
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-current={tab === item.key ? "page" : undefined}
                label={item.label}
                icon={item.key === "funnels" ? <IconActiveFunnels /> : item.key === "forms" ? <IconForms /> : item.key === "settings" ? <IconSidebarSettings /> : undefined}
                iconToneClassName={item.key === "settings" ? portalSidebarIconToneNeutralClass : portalSidebarIconToneClassForSlug("funnel-builder")}
                className={
                  `${portalSidebarBorderButtonBaseClass} ` +
                  (tab === item.key ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass)
                }
              >
                {item.label}
              </PortalSidebarNavButton>
            ))}
          </div>
        </div>
      </div>
    );
  }, [tab]);

  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: funnelSidebar,
      mobileSidebarContent: funnelSidebar,
    });
  }, [funnelSidebar, setSidebarOverride]);

  useEffect(() => {
    return () => setSidebarOverride(null);
  }, [setSidebarOverride]);

  const [funnels, setFunnels] = useState<CreditFunnel[] | null>(null);
  const [forms, setForms] = useState<CreditForm[] | null>(null);
  const [domains, setDomains] = useState<CreditDomain[] | null>(null);

  const [creatingKind, setCreatingKind] = useState<"funnel" | "form" | null>(null);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createTemplateKey, setCreateTemplateKey] = useState<CreditFormTemplateKey>("credit-intake-premium");
  const [createThemeKey, setCreateThemeKey] = useState<CreditFormThemeKey>("royal-indigo");
  const [createFunnelTemplateKey, setCreateFunnelTemplateKey] = useState<CreditFunnelTemplateKey>("credit-audit-leadgen");
  const [createFunnelThemeKey, setCreateFunnelThemeKey] = useState<CreditFunnelThemeKey>("royal-indigo");
  const [createFunnelUseTemplate, setCreateFunnelUseTemplate] = useState(false);
  const [createFunnelPreferCustomMode, setCreateFunnelPreferCustomMode] = useState(false);
  const [createFunnelPageType, setCreateFunnelPageType] = useState<FunnelPageIntentType>("lead-capture");
  const [createFunnelPrimaryCta, setCreateFunnelPrimaryCta] = useState("Get the offer");
  const [createFunnelHeroAssetMode, setCreateFunnelHeroAssetMode] = useState<FunnelPageMediaMode>("auto");
  const [createFunnelAudience, setCreateFunnelAudience] = useState("");
  const [createFunnelOffer, setCreateFunnelOffer] = useState("");
  const [createFunnelGoal, setCreateFunnelGoal] = useState(defaultFunnelGoalForCreate("lead-capture"));
  const [createFunnelShellFrameId, setCreateFunnelShellFrameId] = useState("");
  const [createFunnelCompanyContext, setCreateFunnelCompanyContext] = useState("");
  const [createFunnelQualificationFields, setCreateFunnelQualificationFields] = useState("");
  const [createFunnelStage, setCreateFunnelStage] = useState<CreateFunnelInterviewStage>("business");
  const [createBusinessProfileSummary, setCreateBusinessProfileSummary] = useState<FunnelCreateBusinessProfileSummary | null>(null);
  const [createFunnelDraftSavedAt, setCreateFunnelDraftSavedAt] = useState<string | null>(null);
  const [createFunnelDraftHydrated, setCreateFunnelDraftHydrated] = useState(false);
  const [createIntakeDictationSupported, setCreateIntakeDictationSupported] = useState(false);
  const [createIntakeDictationError, setCreateIntakeDictationError] = useState<string | null>(null);
  const [createIntakeDictatingFieldKey, setCreateIntakeDictatingFieldKey] = useState<"companyContext" | "qualificationFields" | null>(null);
  const [busy, setBusy] = useState(false);
  const createRequestIdRef = useRef<string>("");
  const createIntakeRecognitionRef = useRef<CreateSpeechRecognitionLike | null>(null);
  const createIntakeDictationBaseRef = useRef("");
  const createIntakeDictationFieldKeyRef = useRef<"companyContext" | "qualificationFields" | null>(null);
  const createFunnelDraftSerializedRef = useRef<string>("null");

  const [funnelDeleteBusy, setFunnelDeleteBusy] = useState<Record<string, boolean>>({});
  const [formDeleteBusy, setFormDeleteBusy] = useState<Record<string, boolean>>({});
  const [formSaveBusy, setFormSaveBusy] = useState<Record<string, boolean>>({});
  const [formSettingsDialog, setFormSettingsDialog] = useState<FormSettingsDialog>(null);
  const [formSettingsError, setFormSettingsError] = useState<string | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<
    | { type: "funnel"; id: string }
    | { type: "form"; id: string }
    | null
  >(null);

  const pendingDeleteFunnel = useMemo(() => {
    if (!deleteDialog || deleteDialog.type !== "funnel") return null;
    const id = deleteDialog.id;
    return (funnels || []).find((f) => f.id === id) || null;
  }, [deleteDialog, funnels]);

  const pendingDeleteForm = useMemo(() => {
    if (!deleteDialog || deleteDialog.type !== "form") return null;
    const id = deleteDialog.id;
    return (forms || []).find((f) => f.id === id) || null;
  }, [deleteDialog, forms]);

  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const lastSavedDomainSigRef = useRef<string>("");
  const [domainVercelVerificationById, setDomainVercelVerificationById] = useState<Record<string, VercelVerificationRecord[]>>({});
  const [domainSettingsBusy, setDomainSettingsBusy] = useState<Record<string, boolean>>({});
  const [domainVerifyBusy, setDomainVerifyBusy] = useState<Record<string, boolean>>({});

  const domainSig = domainInput.trim();
  const domainDirty = Boolean(domainSig) && domainSig !== lastSavedDomainSigRef.current;

  const [stripeStatus, setStripeStatus] = useState<StripeIntegrationStatus | null>(null);
  const [stripeStatusBusy, setStripeStatusBusy] = useState(false);
  const [builderSettings, setBuilderSettings] = useState<FunnelBuilderSettings | null>(null);
  const [builderSettingsBusy, setBuilderSettingsBusy] = useState(false);
  const [builderSettingsSaveBusy, setBuilderSettingsSaveBusy] = useState(false);
  const [metaPixelIdInput, setMetaPixelIdInput] = useState("");
  const builderSettingsRef = useRef<FunnelBuilderSettings | null>(null);

  useEffect(() => {
    builderSettingsRef.current = builderSettings;
  }, [builderSettings]);

  const funnelCreateNamingPreview = useMemo(() => {
    if (creatingKind !== "funnel") return null;
    return buildSuggestedFunnelNaming({
      pageType: createFunnelPageType,
      funnelGoal: createFunnelGoal,
      offer: createFunnelOffer,
      primaryCta: createFunnelPrimaryCta,
      fallbackSlug: normalizeSlug(createSlug) || undefined,
      fallbackName: createName.trim() || undefined,
    });
  }, [createFunnelGoal, createFunnelOffer, createFunnelPageType, createFunnelPrimaryCta, createName, createSlug, creatingKind]);

  const funnelInitializationDecision = useMemo(() => {
    if (creatingKind !== "funnel") return null;
    return decideFunnelInitialization({
      pageType: createFunnelPageType,
      funnelGoal: createFunnelGoal,
      offer: createFunnelOffer,
      audience: createFunnelAudience || createBusinessProfileSummary?.targetCustomer || "",
      primaryCta: createFunnelPrimaryCta,
      name: createName,
      slug: createSlug,
      preferCustomMode: createFunnelPreferCustomMode,
    });
  }, [createBusinessProfileSummary?.targetCustomer, createFunnelAudience, createFunnelGoal, createFunnelPageType, createFunnelPreferCustomMode, createFunnelPrimaryCta, createName, createFunnelOffer, createSlug, creatingKind]);

  const funnelCreateInterviewSignals = useMemo(
    () => [
      { label: "Business context loaded", done: Boolean(createBusinessProfileSummary || createFunnelCompanyContext.trim()) },
      { label: "Offer defined", done: Boolean(createFunnelOffer.trim()) },
      { label: "Audience defined", done: Boolean(createFunnelAudience.trim() || createBusinessProfileSummary?.targetCustomer) },
      { label: "Conversion path defined", done: Boolean(createFunnelGoal.trim() && createFunnelPrimaryCta.trim()) },
    ],
    [createBusinessProfileSummary, createFunnelAudience, createFunnelCompanyContext, createFunnelGoal, createFunnelOffer, createFunnelPrimaryCta],
  );

  const funnelCreateStageItems = useMemo(
    () => [
      {
        key: "business" as const,
        label: "Business snapshot",
        hint: "Business context, offer, and structural posture",
        done: Boolean((createBusinessProfileSummary || createFunnelCompanyContext.trim()) && createFunnelOffer.trim()),
      },
      {
        key: "audience" as const,
        label: "Fit and routing",
        hint: "Audience, intake detail, and qualification logic",
        done: Boolean(createFunnelAudience.trim() || createBusinessProfileSummary?.targetCustomer || createFunnelQualificationFields.trim()),
      },
      {
        key: "conversion" as const,
        label: "Conversion path",
        hint: "Goal, CTA, and first-draft recommendation",
        done: Boolean(createFunnelGoal.trim() && createFunnelPrimaryCta.trim()),
      },
    ],
    [createBusinessProfileSummary, createFunnelAudience, createFunnelCompanyContext, createFunnelGoal, createFunnelOffer, createFunnelPrimaryCta, createFunnelQualificationFields],
  );

  const activeCreateFunnelStageIndex = useMemo(
    () => Math.max(0, FUNNEL_CREATE_STAGE_ORDER.indexOf(createFunnelStage)),
    [createFunnelStage],
  );

  const activeCreateFunnelStageComplete = funnelCreateStageItems[activeCreateFunnelStageIndex]?.done ?? false;

  const goToPreviousCreateFunnelStage = useCallback(() => {
    setCreateFunnelStage((prev) => FUNNEL_CREATE_STAGE_ORDER[Math.max(0, FUNNEL_CREATE_STAGE_ORDER.indexOf(prev) - 1)] || "business");
  }, []);

  const goToNextCreateFunnelStage = useCallback(() => {
    setCreateFunnelStage((prev) => FUNNEL_CREATE_STAGE_ORDER[Math.min(FUNNEL_CREATE_STAGE_ORDER.length - 1, FUNNEL_CREATE_STAGE_ORDER.indexOf(prev) + 1)] || "conversion");
  }, []);

  const funnelCreateBusinessContextSeed = useMemo(
    () => buildFunnelCreateBusinessContextSeed(createBusinessProfileSummary),
    [createBusinessProfileSummary],
  );

  const appendCreateContextPrompt = useCallback((prompt: string) => {
    setCreateFunnelCompanyContext((prev) => {
      const nextPrompt = prompt.trim();
      if (!nextPrompt) return prev;
      if (prev.includes(nextPrompt)) return prev;
      return prev.trim() ? `${prev.trim()}\n${nextPrompt}` : `${nextPrompt}\n`;
    });
  }, []);

  const updateCreateIntakeFieldValue = useCallback((fieldKey: "companyContext" | "qualificationFields", value: string) => {
    if (fieldKey === "companyContext") {
      setCreateFunnelCompanyContext(value);
      return;
    }
    setCreateFunnelQualificationFields(value);
  }, []);

  const stopCreateIntakeDictation = useCallback(() => {
    try {
      createIntakeRecognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const startCreateIntakeDictation = useCallback((fieldKey: "companyContext" | "qualificationFields", currentValue: string) => {
    if (createIntakeDictatingFieldKey === fieldKey) {
      stopCreateIntakeDictation();
      return;
    }

    if (typeof window === "undefined") {
      setCreateIntakeDictationError("Speech-to-text is only available in the browser.");
      return;
    }

    const Recognition = getCreateSpeechRecognitionCtor(window);
    if (!Recognition) {
      setCreateIntakeDictationError("This browser does not support built-in speech-to-text.");
      return;
    }

    setCreateIntakeDictationError(null);

    try {
      createIntakeRecognitionRef.current?.abort();
    } catch {
      // ignore
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    createIntakeDictationFieldKeyRef.current = fieldKey;
    createIntakeDictationBaseRef.current = currentValue.trim() ? `${currentValue.trimEnd()}\n\n` : "";
    recognition.onresult = (event) => {
      const segments: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative?.transcript) continue;
        segments.push(alternative.transcript);
      }

      const transcript = segments.join(" ").replace(/\s+/g, " ").trim();
      const nextValue = transcript ? `${createIntakeDictationBaseRef.current}${transcript}` : createIntakeDictationBaseRef.current.trimEnd();
      updateCreateIntakeFieldValue(fieldKey, nextValue.trimEnd());
    };
    recognition.onerror = (event) => {
      setCreateIntakeDictationError(friendlyCreateSpeechError(event));
      setCreateIntakeDictatingFieldKey(null);
      createIntakeDictationFieldKeyRef.current = null;
      createIntakeRecognitionRef.current = null;
    };
    recognition.onend = () => {
      setCreateIntakeDictatingFieldKey(null);
      createIntakeDictationFieldKeyRef.current = null;
      createIntakeRecognitionRef.current = null;
    };

    createIntakeRecognitionRef.current = recognition;
    setCreateIntakeDictatingFieldKey(fieldKey);

    try {
      recognition.start();
    } catch {
      createIntakeRecognitionRef.current = null;
      setCreateIntakeDictatingFieldKey(null);
      createIntakeDictationFieldKeyRef.current = null;
      setCreateIntakeDictationError("Speech-to-text could not start in this browser session.");
    }
  }, [createIntakeDictatingFieldKey, stopCreateIntakeDictation, updateCreateIntakeFieldValue]);

  const funnelCreateNeedsDirectionChoice = Boolean(
    creatingKind === "funnel" &&
    !createFunnelPreferCustomMode &&
    funnelInitializationDecision?.confidence === "low",
  );

  const applyFunnelCreatePageType = useCallback((pageType: FunnelPageIntentType) => {
    setCreateFunnelPageType(pageType);
    setCreateFunnelGoal(defaultFunnelGoalForCreate(pageType));
    setCreateFunnelPrimaryCta(buildPrimaryCtaSuggestions(pageType, "")[0] || "Get started");
  }, []);

  const [funnelDomainBusy, setFunnelDomainBusy] = useState<Record<string, boolean>>({});

  const [funnelStatusBusy, setFunnelStatusBusy] = useState<Record<string, boolean>>({});

  const [openFunnelMenuId, setOpenFunnelMenuId] = useState<string | null>(null);
  const funnelMenuRootRef = useRef<HTMLDivElement | null>(null);
  const funnelMenuElRef = useRef<HTMLDivElement | null>(null);
  const [funnelMenuStyle, setFunnelMenuStyle] = useState<
    | { anchorId: string; top: number; left: number; maxHeight: number; placement: "up" | "down" }
    | null
  >(null);

  const [openFormMenuId, setOpenFormMenuId] = useState<string | null>(null);
  const formMenuRootRef = useRef<HTMLDivElement | null>(null);
  const formMenuElRef = useRef<HTMLDivElement | null>(null);
  const [formMenuStyle, setFormMenuStyle] = useState<
    | { anchorId: string; top: number; left: number; maxHeight: number; placement: "up" | "down" }
    | null
  >(null);

  useLayoutEffect(() => {
    if (!openFunnelMenuId) {
      setFunnelMenuStyle(null);
      return;
    }

    const root = funnelMenuRootRef.current;
    const menu = funnelMenuElRef.current;
    const btn = root?.querySelector('button[aria-label="Funnel actions"]') as HTMLButtonElement | null;
    if (!root || !menu || !btn) return;

    const btnRect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    const VIEWPORT_PAD = 12;
    const GAP = 8;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const spaceBelow = viewportH - btnRect.bottom - GAP - VIEWPORT_PAD;
    const spaceAbove = btnRect.top - GAP - VIEWPORT_PAD;

    const placement: "up" | "down" = spaceBelow >= Math.min(menuRect.height, 240) || spaceBelow >= spaceAbove ? "down" : "up";
    const available = placement === "down" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(80, Math.min(menuRect.height, available));
    const usedHeight = Math.min(menuRect.height, maxHeight);

    let top =
      placement === "down" ? btnRect.bottom + GAP : btnRect.top - GAP - usedHeight;
    let left = btnRect.right - menuRect.width;

    left = Math.min(Math.max(VIEWPORT_PAD, left), viewportW - VIEWPORT_PAD - menuRect.width);
    top = Math.min(Math.max(VIEWPORT_PAD, top), viewportH - VIEWPORT_PAD - usedHeight);

    setFunnelMenuStyle({ anchorId: openFunnelMenuId, top, left, maxHeight, placement });
  }, [openFunnelMenuId]);

  useLayoutEffect(() => {
    if (!openFormMenuId) {
      setFormMenuStyle(null);
      return;
    }

    const root = formMenuRootRef.current;
    const menu = formMenuElRef.current;
    const btn = root?.querySelector('button[aria-label="Form actions"]') as HTMLButtonElement | null;
    if (!root || !menu || !btn) return;

    const btnRect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    const VIEWPORT_PAD = 12;
    const GAP = 8;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const spaceBelow = viewportH - btnRect.bottom - GAP - VIEWPORT_PAD;
    const spaceAbove = btnRect.top - GAP - VIEWPORT_PAD;

    const placement: "up" | "down" = spaceBelow >= Math.min(menuRect.height, 240) || spaceBelow >= spaceAbove ? "down" : "up";
    const available = placement === "down" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(80, Math.min(menuRect.height, available));
    const usedHeight = Math.min(menuRect.height, maxHeight);

    let top =
      placement === "down" ? btnRect.bottom + GAP : btnRect.top - GAP - usedHeight;
    let left = btnRect.right - menuRect.width;

    left = Math.min(Math.max(VIEWPORT_PAD, left), viewportW - VIEWPORT_PAD - menuRect.width);
    top = Math.min(Math.max(VIEWPORT_PAD, top), viewportH - VIEWPORT_PAD - usedHeight);

    setFormMenuStyle({ anchorId: openFormMenuId, top, left, maxHeight, placement });
  }, [openFormMenuId]);

  const loadStripeStatus = useCallback(async () => {
    setStripeStatusBusy(true);
    try {
      const res = await fetch("/api/portal/integrations/stripe", { cache: "no-store" }).catch(() => null as any);
      if (!res?.ok) return;
      const json = (await res.json().catch(() => null)) as any;
      if (!json || json.ok !== true || !json.stripe) return;
      setStripeStatus({
        configured: Boolean(json.stripe.configured),
        accountId: json.stripe.accountId ? String(json.stripe.accountId) : null,
        connectedAtIso: json.stripe.connectedAtIso ? String(json.stripe.connectedAtIso) : null,
      });
    } finally {
      setStripeStatusBusy(false);
    }
  }, []);

  const loadBuilderSettings = useCallback(async (options?: { silent?: boolean }) => {
    setBuilderSettingsBusy(true);
    try {
      const res = await fetch("/api/portal/funnel-builder/settings", { cache: "no-store" });
      const json = await readFunnelBuilderJson<any>(res, "load builder settings");
      if (!json.settings) throw new Error("We couldn't load builder settings right now. Refresh and try again.");

      const nextSettings: FunnelBuilderSettings = {
        metaPixelId: typeof json.settings.metaPixelId === "string" && json.settings.metaPixelId.trim()
          ? String(json.settings.metaPixelId).trim()
          : null,
        createFunnelDraft: parseFunnelCreateDraft(json.settings.createFunnelDraft),
      };

      setBuilderSettings(nextSettings);
      setMetaPixelIdInput(nextSettings.metaPixelId || "");
      return nextSettings;
    } catch (e) {
      if (!options?.silent) toast.error(normalizeFunnelBuilderError("load builder settings", e));
      return null;
    } finally {
      setBuilderSettingsBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    if (tab !== "settings") return;
    void Promise.all([loadStripeStatus(), loadBuilderSettings()]);
  }, [loadBuilderSettings, loadStripeStatus, tab]);

  const saveBuilderSettings = useCallback(async () => {
    if (builderSettingsSaveBusy) return;

    setBuilderSettingsSaveBusy(true);
    try {
      const res = await fetch("/api/portal/funnel-builder/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metaPixelId: metaPixelIdInput }),
      });
      const json = await readFunnelBuilderJson<any>(res, "save builder settings");
      if (!json.settings) throw new Error("We couldn't save builder settings right now. Please try again.");

      const nextSettings: FunnelBuilderSettings = {
        metaPixelId: typeof json.settings.metaPixelId === "string" && json.settings.metaPixelId.trim()
          ? String(json.settings.metaPixelId).trim()
          : null,
        createFunnelDraft: parseFunnelCreateDraft(json.settings.createFunnelDraft),
      };

      setBuilderSettings(nextSettings);
      setMetaPixelIdInput(nextSettings.metaPixelId || "");
      toast.success(nextSettings.metaPixelId ? "Meta pixel saved." : "Meta pixel cleared.");
    } catch (e) {
      toast.error(normalizeFunnelBuilderError("save builder settings", e));
    } finally {
      setBuilderSettingsSaveBusy(false);
    }
  }, [builderSettingsSaveBusy, metaPixelIdInput, toast]);

  const saveCreateFunnelDraft = useCallback(async (draft: FunnelCreateDraft | null) => {
    try {
      const res = await fetch("/api/portal/funnel-builder/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ createFunnelDraft: draft }),
      });
      const json = await readFunnelBuilderJson<any>(res, "save funnel draft");
      if (!json.settings) throw new Error("We couldn't save the funnel draft right now.");

      const nextSettings: FunnelBuilderSettings = {
        metaPixelId: typeof json.settings.metaPixelId === "string" && json.settings.metaPixelId.trim()
          ? String(json.settings.metaPixelId).trim()
          : null,
        createFunnelDraft: parseFunnelCreateDraft(json.settings.createFunnelDraft),
      };

      setBuilderSettings(nextSettings);
      setMetaPixelIdInput(nextSettings.metaPixelId || "");
      setCreateFunnelDraftSavedAt(nextSettings.createFunnelDraft?.updatedAt || null);
      createFunnelDraftSerializedRef.current = JSON.stringify(nextSettings.createFunnelDraft);
      return nextSettings.createFunnelDraft;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!openFunnelMenuId) return;

    const close = () => setOpenFunnelMenuId(null);

    const onDown = (ev: MouseEvent) => {
      const root = funnelMenuRootRef.current;
      const target = ev.target;
      if (root && target && target instanceof Node && root.contains(target)) return;
      close();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openFunnelMenuId]);

  useEffect(() => {
    if (!openFormMenuId) return;

    const close = () => setOpenFormMenuId(null);

    const onDown = (ev: MouseEvent) => {
      const root = formMenuRootRef.current;
      const target = ev.target;
      if (root && target && target instanceof Node && root.contains(target)) return;
      close();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openFormMenuId]);

  const domainsByName = useMemo(() => {
    const m = new Map<string, CreditDomain>();
    for (const d of domains || []) {
      const k = String(d.domain || "").trim().toLowerCase();
      if (!k) continue;
      m.set(k, d);
    }
    return m;
  }, [domains]);

  const getAssignedDomainStatus = useCallback(
    (assignedDomain: string | null | undefined): "PENDING" | "VERIFIED" | null => {
      const clean = String(assignedDomain || "").trim().toLowerCase();
      if (!clean) return null;
      const d = domainsByName.get(clean);
      return d?.status ?? "PENDING";
    },
    [domainsByName],
  );

  const funnelDomainOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; hint?: string }> = [{ value: "", label: "Default (not assigned)" }];
    for (const d of domains || []) {
      opts.push({
        value: d.domain,
        label: d.domain,
        hint: d.status === "PENDING" ? "Pending DNS verification" : undefined,
      });
    }
    return opts;
  }, [domains]);

  const normalizedMetaPixelIdInput = useMemo(
    () => String(metaPixelIdInput || "").trim().replace(/[^0-9]/g, "").slice(0, 32),
    [metaPixelIdInput],
  );
  const savedMetaPixelId = builderSettings?.metaPixelId || "";
  const metaPixelDirty = normalizedMetaPixelIdInput !== savedMetaPixelId;
  const platformTargetHost = useMemo(() => coercePlatformTargetHost(), []);
  const isLocalPreview = useMemo(() => {
    const h = (platformTargetHost || "").trim().toLowerCase();
    return h === "localhost" || h.endsWith(".local") || h === "127.0.0.1";
  }, [platformTargetHost]);

  const runtimeHostedOrigin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin || null;
    return null;
  }, []);

  const formPublicBase = useMemo(() => toRuntimeHostedUrl("/forms", runtimeHostedOrigin), [runtimeHostedOrigin]);

  const getFunnelLiveHref = useCallback(
    (assignedDomain: string | null | undefined, slug: string, funnelId: string) => {
      const cleanSlug = String(slug || "").trim();
      const cleanId = String(funnelId || "").trim();
      if (!cleanSlug || !cleanId) return null;

      const cleanDomain = String(assignedDomain || "").trim().toLowerCase();
      if (cleanDomain) {
        if (isLocalPreview) return `/domain-router/${encodeURIComponent(cleanDomain)}/${encodeURIComponent(cleanSlug)}`;
        return `https://${cleanDomain}/${encodeURIComponent(cleanSlug)}`;
      }

      const hostedPath = hostedFunnelPath(cleanSlug, cleanId);
      return hostedPath ? toRuntimeHostedUrl(hostedPath, runtimeHostedOrigin) : null;
    },
    [isLocalPreview, runtimeHostedOrigin],
  );

  const getFormPreviewHref = useCallback((slug: string, formId: string) => {
    const cleanSlug = String(slug || "").trim();
    const cleanId = String(formId || "").trim();
    if (!cleanSlug || !cleanId) return null;
    const hostedPath = hostedFormPath(cleanSlug, cleanId);
    return hostedPath ? toRuntimeHostedUrl(hostedPath, runtimeHostedOrigin) : null;
  }, [runtimeHostedOrigin]);

  const getFormLiveHref = useCallback((slug: string, formId: string) => {
    const cleanSlug = String(slug || "").trim();
    const cleanId = String(formId || "").trim();
    if (!cleanSlug || !cleanId) return null;
    const hostedPath = hostedFormPath(cleanSlug, cleanId);
    return hostedPath ? toRuntimeHostedUrl(hostedPath, runtimeHostedOrigin) : null;
  }, [runtimeHostedOrigin]);

  const loadFunnels = useCallback(async () => {
    const res = await fetch("/api/portal/funnel-builder/funnels", { cache: "no-store" });
    const json = await readFunnelBuilderJson<any>(res, "load funnels");
    setFunnels(Array.isArray(json.funnels) ? json.funnels : []);
  }, []);

  const loadForms = useCallback(async () => {
    const res = await fetch("/api/portal/funnel-builder/forms", { cache: "no-store" });
    const json = await readFunnelBuilderJson<any>(res, "load forms");
    setForms(Array.isArray(json.forms) ? json.forms : []);
  }, []);

  const loadDomains = useCallback(async () => {
    const res = await fetch("/api/portal/funnel-builder/domains", { cache: "no-store" });
    const json = await readFunnelBuilderJson<any>(res, "load domains");
    setDomains(Array.isArray(json.domains) ? json.domains : []);
  }, []);

  const deleteFunnel = useCallback(
    async (f: CreditFunnel) => {
      if (funnelDeleteBusy[f.id]) return;
      setFunnelDeleteBusy((m) => ({ ...m, [f.id]: true }));
      try {
        const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(f.id)}`, {
          method: "DELETE",
        });
        await readFunnelBuilderJson<any>(res, "delete this funnel");
        setFunnels((prev) => (prev ? prev.filter((row) => row.id !== f.id) : prev));
        toast.success("Funnel deleted.");
        try {
          await loadDomains();
        } catch {
          // ignore
        }
      } catch (e) {
        toast.error(normalizeFunnelBuilderError("delete this funnel", e));
      } finally {
        setFunnelDeleteBusy((m) => ({ ...m, [f.id]: false }));
      }
    },
    [funnelDeleteBusy, loadDomains, toast],
  );

  const deleteForm = useCallback(
    async (f: CreditForm) => {
      if (formDeleteBusy[f.id]) return;
      setFormDeleteBusy((m) => ({ ...m, [f.id]: true }));
      try {
        const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(f.id)}`, {
          method: "DELETE",
        });
        await readFunnelBuilderJson<any>(res, "delete this form");
        setForms((prev) => (prev ? prev.filter((row) => row.id !== f.id) : prev));
        toast.success("Form deleted.");
      } catch (e) {
        toast.error(normalizeFunnelBuilderError("delete this form", e));
      } finally {
        setFormDeleteBusy((m) => ({ ...m, [f.id]: false }));
      }
    },
    [formDeleteBusy, toast],
  );

  const patchForm = useCallback(
    async (form: CreditForm, data: Partial<Pick<CreditForm, "slug" | "status" | "name">>) => {
      if (formSaveBusy[form.id]) return false;
      setFormSaveBusy((m) => ({ ...m, [form.id]: true }));
      try {
        const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(form.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = await readFunnelBuilderJson<any>(res, "update this form");

        setForms((prev) => {
          if (!prev) return prev;
          return prev.map((row) => (row.id === form.id ? { ...row, ...json.form } : row));
        });
        return true;
      } catch (e) {
        toast.error(normalizeFunnelBuilderError("update this form", e));
        try {
          await loadForms();
        } catch {
          // ignore
        }
        return false;
      } finally {
        setFormSaveBusy((m) => ({ ...m, [form.id]: false }));
      }
    },
    [formSaveBusy, loadForms, toast],
  );

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(String(text || ""));
    } catch {
      // ignore
    }
  }, []);

  const verifyDomain = useCallback(
    async (domain: CreditDomain) => {
      setDomainVerifyBusy((m) => ({ ...m, [domain.id]: true }));

      try {
        const res = await fetch(`/api/portal/funnel-builder/domains/${encodeURIComponent(domain.id)}/verify`, {
          method: "POST",
          cache: "no-store",
        });
        const json = await readFunnelBuilderJson<any>(res, "verify this domain");

        const vercelRecords = extractVercelVerificationRecords(json?.debug?.vercel?.verification);
        const vercelVerified = json?.debug?.vercel?.ok === true && json?.debug?.vercel?.verified === true;
        if (json?.verified === true || vercelVerified) {
          setDomainVercelVerificationById((m) => {
            const next = { ...m };
            delete next[domain.id];
            return next;
          });
        } else if (vercelRecords.length) {
          setDomainVercelVerificationById((m) => ({ ...m, [domain.id]: vercelRecords }));
        }

        if (json.domain) {
          setDomains((prev) => {
            if (!prev) return prev;
            return prev.map((d) => (d.id === domain.id ? { ...d, ...json.domain } : d));
          });
        }

        if (json.verified === true && json.domain) {
          setDomains((prev) => {
            if (!prev) return prev;
            return prev.map((d) => (d.id === domain.id ? { ...d, ...json.domain } : d));
          });
          toast.success("Domain verified.");
          return;
        }

        const expectedTargetHost =
          typeof json?.debug?.expectedTargetHost === "string" ? String(json.debug.expectedTargetHost).trim() : "";
        const raw = typeof json?.error === "string" ? json.error : "";
        const isActionable =
          /^dns\s+is\s+pointing\s+correctly/i.test(raw) ||
          /^your\s+domain\s+has\s+/i.test(raw) ||
          /ssl|https|certificate|provision/i.test(raw) ||
          /contact\s+support/i.test(raw);

        const base = raw
          ? /dns\s+doesn\W?t\s+resolve/i.test(raw)
            ? "Not verified yet: your domain’s DNS isn’t pointing to Purely yet (or DNS propagation isn’t finished)."
            : /cname\s+doesn\W?t\s+point/i.test(raw)
              ? "Not verified yet: your CNAME record isn’t pointing to Purely yet (or DNS propagation isn’t finished)."
              : isActionable
                ? raw
                : `Not verified yet: ${raw}`
          : "Not verified yet. DNS changes can take a few minutes to propagate.";

        const hint = expectedTargetHost ? ` Expected target: ${expectedTargetHost}.` : "";

        const hasHostingRecords = vercelRecords.length > 0 || (domainVercelVerificationById[domain.id] || []).length > 0;
        const hostingHint = hasHostingRecords ? " See hosting verification records below." : "";

        toast.info(
          `${base}${hint}${hostingHint}${isActionable ? "" : " Double-check the records below and try again in a few minutes."}`,
        );
      } catch (e) {
        toast.error(normalizeFunnelBuilderError("verify this domain", e));
      } finally {
        setDomainVerifyBusy((m) => ({ ...m, [domain.id]: false }));
      }
    },
    [domainVercelVerificationById, toast],
  );

  const patchDomainSettings = useCallback(
    async (domain: CreditDomain, next: { rootMode: "DISABLED" | "DIRECTORY" | "REDIRECT"; rootFunnelSlug: string | null }) => {
      setDomainSettingsBusy((m) => ({ ...m, [domain.id]: true }));

      // Optimistic update
      setDomains((prev) => {
        if (!prev) return prev;
        return prev.map((d) => (d.id === domain.id ? { ...d, rootMode: next.rootMode, rootFunnelSlug: next.rootFunnelSlug } : d));
      });

      try {
        const res = await fetch("/api/portal/funnel-builder/domains", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain: domain.domain, rootMode: next.rootMode, rootFunnelSlug: next.rootFunnelSlug }),
        });
        const json = await readFunnelBuilderJson<any>(res, "update this domain");

        setDomains((prev) => {
          if (!prev) return prev;
          return prev.map((d) =>
            d.id === domain.id
              ? { ...d, rootMode: json.rootMode, rootFunnelSlug: json.rootFunnelSlug ?? null }
              : d,
          );
        });
        toast.success("Domain settings updated.");
      } catch (e) {
        toast.error(normalizeFunnelBuilderError("update this domain", e));
        // Re-sync from server in case optimistic state diverged.
        try {
          await loadDomains();
        } catch {
          // ignore
        }
      } finally {
        setDomainSettingsBusy((m) => ({ ...m, [domain.id]: false }));
      }
    },
    [loadDomains, toast],
  );

  const patchFunnelDomain = useCallback(
    async (funnel: CreditFunnel, nextDomain: string | null) => {
      setFunnelDomainBusy((m) => ({ ...m, [funnel.id]: true }));

      // Optimistic update
      setFunnels((prev) => {
        if (!prev) return prev;
        return prev.map((f) => {
          if (f.id !== funnel.id) return f;
          return { ...f, assignedDomain: nextDomain };
        });
      });

      try {
        const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnel.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain: nextDomain }),
        });
        const json = await readFunnelBuilderJson<any>(res, "update this funnel domain");
        const assigned = (json?.funnel?.assignedDomain ?? null) as string | null;
        const status = (json?.funnel?.status ?? null) as CreditFunnel["status"] | null;

        setFunnels((prev) => {
          if (!prev) return prev;
          return prev.map((f) =>
            f.id === funnel.id
              ? {
                  ...f,
                  assignedDomain: assigned,
                  status: status && (status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED") ? status : f.status,
                }
              : f,
          );
        });
        toast.success("Funnel domain updated.");
      } catch (e) {
        toast.error(normalizeFunnelBuilderError("update this funnel domain", e));
        try {
          await loadFunnels();
        } catch {
          // ignore
        }
      } finally {
        setFunnelDomainBusy((m) => ({ ...m, [funnel.id]: false }));
      }
    },
    [loadFunnels, toast],
  );

  const patchFunnelStatus = useCallback(
    async (funnel: CreditFunnel, nextStatus: CreditFunnel["status"]) => {
      if (funnelStatusBusy[funnel.id]) return false;
      if (funnel.status === nextStatus) return true;

      setFunnelStatusBusy((m) => ({ ...m, [funnel.id]: true }));

      // Optimistic update
      setFunnels((prev) => {
        if (!prev) return prev;
        return prev.map((f) => (f.id === funnel.id ? { ...f, status: nextStatus } : f));
      });

      try {
        const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnel.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await readFunnelBuilderJson<any>(res, "update this funnel status");

        const status = (json?.funnel?.status ?? null) as CreditFunnel["status"] | null;
        if (status && (status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED")) {
          setFunnels((prev) => {
            if (!prev) return prev;
            return prev.map((f) => (f.id === funnel.id ? { ...f, status } : f));
          });
        }

        toast.success("Funnel status updated.");
        return true;
      } catch (e) {
        toast.error(normalizeFunnelBuilderError("update this funnel status", e));
        try {
          await loadFunnels();
        } catch {
          // ignore
        }

        return false;
      } finally {
        setFunnelStatusBusy((m) => ({ ...m, [funnel.id]: false }));
      }
    },
    [funnelStatusBusy, loadFunnels, toast],
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await Promise.all([loadFunnels(), loadForms()]);
        if (!mounted) return;
        await loadDomains();
      } catch (e) {
        if (!mounted) return;
        toast.error(normalizeFunnelBuilderError("load funnel builder data", e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadDomains, loadForms, loadFunnels, toast]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/portal/business-profile", {
          cache: "no-store",
          headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
        });
        const json = (await res.json().catch(() => null)) as any;
        const profile = resolveBusinessProfileRuntimeSnapshot({
          profile: json?.profile,
          draftProfile: json?.draftProfile,
          guidedIntake: json?.guidedIntake,
        });
        const nextSummary = {
          businessName: profile.businessName,
          industry: profile.industry,
          businessModel: profile.businessModel,
          targetCustomer: profile.targetCustomer,
          brandVoice: profile.brandVoice,
          businessContext: profile.businessContext,
          primaryGoals: normalizeBusinessProfileGoals(profile.primaryGoals),
          brandPrimaryHex: profile.brandPrimaryHex,
          brandSecondaryHex: profile.brandSecondaryHex,
          brandAccentHex: profile.brandAccentHex,
          brandTextHex: profile.brandTextHex,
        };

        if (cancelled) return;
        setCreateBusinessProfileSummary(
          nextSummary.businessName ||
            nextSummary.industry ||
            nextSummary.businessModel ||
            nextSummary.targetCustomer ||
            nextSummary.brandVoice ||
            nextSummary.businessContext ||
            nextSummary.primaryGoals.length ||
            nextSummary.brandPrimaryHex ||
            nextSummary.brandSecondaryHex ||
            nextSummary.brandAccentHex ||
            nextSummary.brandTextHex
            ? nextSummary
            : null,
        );
      } catch {
        if (!cancelled) setCreateBusinessProfileSummary(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [portalVariant]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCreateIntakeDictationSupported(Boolean(getCreateSpeechRecognitionCtor(window)));
    return () => {
      try {
        createIntakeRecognitionRef.current?.abort();
      } catch {
        // ignore
      }
      createIntakeRecognitionRef.current = null;
      createIntakeDictationFieldKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!creatingKind) {
      setCreateFunnelDraftHydrated(false);
      setCreateFunnelDraftSavedAt(null);
      setCreateIntakeDictationError(null);
      setCreateIntakeDictatingFieldKey(null);
      setCreateFunnelStage("business");
      return;
    }
    const seededIntent = inferFunnelPageIntentProfile({ existing: { pageType: "lead-capture" } });
    setCreateSlug("");
    setCreateName("");
    setCreateTemplateKey("credit-intake-premium");
    setCreateThemeKey("royal-indigo");
    setCreateFunnelTemplateKey("credit-audit-leadgen");
    setCreateFunnelThemeKey("royal-indigo");
    setCreateFunnelUseTemplate(false);
    setCreateFunnelPreferCustomMode(false);
    setCreateFunnelPageType(seededIntent.pageType);
    setCreateFunnelPrimaryCta(buildPrimaryCtaSuggestions(seededIntent.pageType, seededIntent.primaryCta)[0] || seededIntent.primaryCta);
    setCreateFunnelHeroAssetMode(seededIntent.mediaPlan.heroAssetMode);
    setCreateFunnelAudience("");
    setCreateFunnelOffer("");
    setCreateFunnelGoal(defaultFunnelGoalForCreate(seededIntent.pageType));
    setCreateFunnelShellFrameId(seededIntent.shellFrameId);
    setCreateFunnelCompanyContext("");
    setCreateFunnelQualificationFields("");
    setCreateFunnelStage("business");
    setCreateIntakeDictationError(null);
    setCreateIntakeDictatingFieldKey(null);

    let cancelled = false;

    const applyDraft = (draft: FunnelCreateDraft | null) => {
      if (cancelled) return;
      if (draft) {
        setCreateSlug(draft.slug);
        setCreateName(draft.name);
        setCreateFunnelPreferCustomMode(draft.preferCustomMode);
        setCreateFunnelPageType(draft.pageType);
        setCreateFunnelPrimaryCta(draft.primaryCta || buildPrimaryCtaSuggestions(draft.pageType, "")[0] || "Get started");
        setCreateFunnelHeroAssetMode(draft.heroAssetMode);
        setCreateFunnelAudience(draft.audience);
        setCreateFunnelOffer(draft.offer);
        setCreateFunnelGoal(draft.goal || defaultFunnelGoalForCreate(draft.pageType));
        setCreateFunnelShellFrameId(draft.shellFrameId);
        setCreateFunnelCompanyContext(draft.companyContext);
        setCreateFunnelQualificationFields(draft.qualificationFields);
        setCreateFunnelStage(draft.stage || "business");
        setCreateFunnelDraftSavedAt(draft.updatedAt || null);
      } else {
        setCreateFunnelDraftSavedAt(null);
      }
      createFunnelDraftSerializedRef.current = JSON.stringify(draft);
      setCreateFunnelDraftHydrated(true);
    };

    if (creatingKind === "funnel") {
      void (async () => {
        const nextSettings = builderSettingsRef.current || await loadBuilderSettings({ silent: true });
        applyDraft(nextSettings?.createFunnelDraft ?? null);
      })();
    } else {
      setCreateFunnelDraftHydrated(false);
    }

    return () => {
      cancelled = true;
    };
  }, [creatingKind, loadBuilderSettings]);

  useEffect(() => {
    if (creatingKind !== "funnel" || !createFunnelDraftHydrated) return;

    const draft: FunnelCreateDraft = {
      v: 1,
      updatedAt: createFunnelDraftSavedAt || "",
      stage: createFunnelStage,
      slug: createSlug,
      name: createName,
      pageType: createFunnelPageType,
      primaryCta: createFunnelPrimaryCta,
      heroAssetMode: createFunnelHeroAssetMode,
      audience: createFunnelAudience,
      offer: createFunnelOffer,
      goal: createFunnelGoal,
      shellFrameId: createFunnelShellFrameId,
      companyContext: createFunnelCompanyContext,
      qualificationFields: createFunnelQualificationFields,
      preferCustomMode: createFunnelPreferCustomMode,
    };

    const meaningfulDraft =
      Boolean(createSlug.trim() || createName.trim() || createFunnelOffer.trim() || createFunnelAudience.trim() || createFunnelCompanyContext.trim() || createFunnelQualificationFields.trim())
      || createFunnelPageType !== "lead-capture"
      || createFunnelPrimaryCta.trim() !== (buildPrimaryCtaSuggestions("lead-capture", "")[0] || "Get started")
      || createFunnelGoal.trim() !== defaultFunnelGoalForCreate("lead-capture")
      || createFunnelPreferCustomMode
      || createFunnelStage !== "business";

    const payload = meaningfulDraft ? draft : null;
    const serialized = JSON.stringify(payload);
    if (serialized === createFunnelDraftSerializedRef.current) return;

    const timeoutId = window.setTimeout(() => {
      void saveCreateFunnelDraft(payload);
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    createFunnelAudience,
    createFunnelCompanyContext,
    createFunnelDraftHydrated,
    createFunnelGoal,
    createFunnelHeroAssetMode,
    createFunnelOffer,
    createFunnelPageType,
    createFunnelPreferCustomMode,
    createFunnelPrimaryCta,
    createFunnelQualificationFields,
    createFunnelShellFrameId,
    createFunnelStage,
    createName,
    createSlug,
    createFunnelDraftSavedAt,
    saveCreateFunnelDraft,
    creatingKind,
  ]);

  const clearCreateFunnelDraft = useCallback(() => {
    const seededIntent = inferFunnelPageIntentProfile({ existing: { pageType: "lead-capture" } });
    setCreateSlug("");
    setCreateName("");
    setCreateFunnelUseTemplate(false);
    setCreateFunnelPreferCustomMode(false);
    setCreateFunnelPageType(seededIntent.pageType);
    setCreateFunnelPrimaryCta(buildPrimaryCtaSuggestions(seededIntent.pageType, seededIntent.primaryCta)[0] || seededIntent.primaryCta);
    setCreateFunnelHeroAssetMode(seededIntent.mediaPlan.heroAssetMode);
    setCreateFunnelAudience("");
    setCreateFunnelOffer("");
    setCreateFunnelGoal(defaultFunnelGoalForCreate(seededIntent.pageType));
    setCreateFunnelShellFrameId(seededIntent.shellFrameId);
    setCreateFunnelCompanyContext("");
    setCreateFunnelQualificationFields("");
    setCreateFunnelStage("business");
    setCreateFunnelDraftSavedAt(null);
    setCreateIntakeDictationError(null);
    createFunnelDraftSerializedRef.current = "null";
    void saveCreateFunnelDraft(null);
  }, [saveCreateFunnelDraft]);

  const openCreate = (kind: "funnel" | "form") => {
    createRequestIdRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setCreatingKind(kind);
  };

  const closeCreate = () => {
    createRequestIdRef.current = "";
    stopCreateIntakeDictation();
    setCreatingKind(null);
    setBusy(false);
  };

  const submitCreate = async () => {
    if (!creatingKind) return;
    setBusy(true);

    try {
      const funnelNaming = buildSuggestedFunnelNaming({
        pageType: createFunnelPageType,
        funnelGoal: createFunnelGoal,
        offer: createFunnelOffer,
        primaryCta: createFunnelPrimaryCta,
        fallbackSlug: normalizeSlug(createSlug) || undefined,
        fallbackName: createName.trim() || undefined,
        templateLabel: creatingKind === "funnel" && createFunnelUseTemplate ? getCreditFunnelTemplate(createFunnelTemplateKey)?.label : undefined,
      });
      const slug = creatingKind === "funnel" ? normalizeSlug(createSlug) || funnelNaming.slug : normalizeSlug(createSlug);
      if (!slug) throw new Error("Enter a valid slug (letters, numbers, hyphens)");

      const endpoint = creatingKind === "funnel" ? "/api/portal/funnel-builder/funnels" : "/api/portal/funnel-builder/forms";
      const trimmedName = createName.trim();
      const trimmedFunnelGoal = createFunnelGoal.trim();
      const trimmedFunnelAudience = createFunnelAudience.trim();
      const trimmedFunnelOffer = createFunnelOffer.trim();
      const trimmedPrimaryCta = createFunnelPrimaryCta.trim();
      const trimmedCompanyContext = createFunnelCompanyContext.trim();
      const trimmedQualificationFields = createFunnelQualificationFields.trim();
      const resolvedCompanyContext = [funnelCreateBusinessContextSeed, trimmedCompanyContext].filter(Boolean).join("\n\n");
      const resolvedFunnelAudience = trimmedFunnelAudience || createBusinessProfileSummary?.targetCustomer || "";
      if (creatingKind === "funnel" && !trimmedFunnelOffer) {
        throw new Error("Enter the service, offer, or funnel concept first");
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: createRequestIdRef.current || undefined,
          slug,
          name: trimmedName || undefined,
          ...(creatingKind === "form"
            ? {
                templateKey: coerceCreditFormTemplateKey(createTemplateKey),
                themeKey: coerceCreditFormThemeKey(createThemeKey),
              }
            : creatingKind === "funnel"
              ? {
                  ...(createFunnelUseTemplate
                    ? {
                        templateKey: coerceCreditFunnelTemplateKey(createFunnelTemplateKey),
                        themeKey: coerceCreditFunnelThemeKey(createFunnelThemeKey),
                      }
                    : {
                        pageType: createFunnelPageType,
                        ...(trimmedFunnelGoal ? { funnelGoal: trimmedFunnelGoal } : null),
                        ...(resolvedFunnelAudience ? { audience: resolvedFunnelAudience, audienceSummary: resolvedFunnelAudience } : null),
                        ...(trimmedFunnelOffer ? { offer: trimmedFunnelOffer, offerSummary: trimmedFunnelOffer } : null),
                        ...(trimmedPrimaryCta ? { primaryCta: trimmedPrimaryCta } : null),
                        ...(resolvedCompanyContext ? { companyContext: resolvedCompanyContext } : null),
                        ...(trimmedQualificationFields ? { qualificationFields: trimmedQualificationFields } : null),
                        heroAssetMode: createFunnelHeroAssetMode,
                        ...(createFunnelPreferCustomMode ? { preferCustomMode: true } : null),
                        ...(createFunnelShellFrameId ? { shellFrameId: createFunnelShellFrameId } : null),
                      }),
                }
              : {}),
        }),
      });
      const json = await readFunnelBuilderJson<any>(res, creatingKind === "funnel" ? "create this funnel" : "create this form");

      if (creatingKind === "funnel") {
        clearCreateFunnelDraft();
        await loadFunnels();
        closeCreate();
        toast.success(
          typeof json?.initialization?.summary === "string" && json.initialization.summary.trim()
            ? json.initialization.summary.trim()
            : "Funnel created.",
        );
        if (typeof json?.funnel?.id === "string" && json.funnel.id) {
          router.push(
            `${basePath}/app/services/funnel-builder/funnels/${encodeURIComponent(json.funnel.id)}/edit`,
          );
        }
      } else {
        await loadForms();
        closeCreate();
        toast.success("Form created.");
      }
    } catch (e) {
      toast.error(normalizeFunnelBuilderError(creatingKind === "funnel" ? "create this funnel" : "create this form", e));
      setBusy(false);
    }
  };

  const saveDomain = async () => {
    setDomainBusy(true);
    try {
      const sig = domainInput.trim();
      const res = await fetch("/api/portal/funnel-builder/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: sig }),
      });
      const json = await readFunnelBuilderJson<any>(res, "save this domain");

      const domainId = typeof json?.domain?.id === "string" ? json.domain.id : "";
      const vercelRecords = extractVercelVerificationRecords(json?.provisioning?.verification);
      if (domainId && vercelRecords.length) {
        setDomainVercelVerificationById((m) => ({ ...m, [domainId]: vercelRecords }));
      }

      lastSavedDomainSigRef.current = sig;
      await loadDomains();
      toast.success("Domain saved.");
    } catch (e) {
      toast.error(normalizeFunnelBuilderError("save this domain", e));
    } finally {
      setDomainBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PortalBackToOnboardingLink />
      <AppConfirmModal
        open={deleteDialog?.type === "funnel"}
        title="Delete funnel"
        message={
          pendingDeleteFunnel
            ? `Delete funnel “${pendingDeleteFunnel.name}”? This will remove all pages and cannot be undone.`
            : "Delete this funnel?"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          const f = pendingDeleteFunnel;
          setDeleteDialog(null);
          if (!f) return;
          void deleteFunnel(f);
        }}
      />

      <AppConfirmModal
        open={deleteDialog?.type === "form"}
        title="Delete form"
        message={
          pendingDeleteForm
            ? `Delete form “${pendingDeleteForm.name}”? This will remove all submissions and cannot be undone.`
            : "Delete this form?"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          const f = pendingDeleteForm;
          setDeleteDialog(null);
          if (!f) return;
          void deleteForm(f);
        }}
      />

      <AppModal
        open={!!formSettingsDialog}
        title="Form settings"
        description="Manage the form slug and status from the forms list."
        onClose={() => {
          setFormSettingsDialog(null);
          setFormSettingsError(null);
        }}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={classNames(
                "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50",
                FUNNEL_BUTTON_MOTION_CLASS,
                FUNNEL_BUTTON_SUBTLE_RAISE_CLASS,
              )}
              onClick={() => {
                setFormSettingsDialog(null);
                setFormSettingsError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                FUNNEL_BUTTON_MOTION_CLASS,
                FUNNEL_BUTTON_RAISE_CLASS,
              )}
              onClick={() => {
                const current = formSettingsDialog;
                if (!current) return;
                const normalized = normalizeSlug(current.slug);
                if (!normalized) {
                  setFormSettingsError("Slug is required.");
                  return;
                }
                const base = (forms || []).find((item) => item.id === current.id);
                if (!base) {
                  setFormSettingsDialog(null);
                  return;
                }
                void (async () => {
                  const ok = await patchForm(base, { slug: normalized, status: current.status });
                  if (ok) {
                    setFormSettingsDialog(null);
                    setFormSettingsError(null);
                    toast.success("Form updated.");
                  }
                })();
              }}
            >
              Save
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
            <input
              value={formSettingsDialog?.slug || ""}
              onChange={(e) => {
                setFormSettingsError(null);
                setFormSettingsDialog((prev) => (prev ? { ...prev, slug: e.target.value } : prev));
              }}
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</div>
            <PortalListboxDropdown
              value={formSettingsDialog?.status || "DRAFT"}
              onChange={(value) =>
                setFormSettingsDialog((prev) =>
                  prev
                    ? {
                        ...prev,
                        status: value === "ACTIVE" || value === "ARCHIVED" ? value : "DRAFT",
                      }
                    : prev,
                )
              }
              options={[
                { value: "DRAFT", label: "Draft" },
                { value: "ACTIVE", label: "Live" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
              className="mt-1 w-full"
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
            />
          </label>

          {formSettingsError ? <div className="text-sm font-semibold text-red-700">{formSettingsError}</div> : null}
        </div>
      </AppModal>

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Funnel Builder</h1>
          <p className="mt-1 text-sm text-zinc-600">Create, refine, and publish guided funnels without starting from a blank page.</p>
        </div>
      </div>

      {tab === "funnels" ? (
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => openCreate("funnel")}
              className="pa-funnel-builder-create-card group flex min-h-40 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-300 bg-white p-6 text-left transition-colors duration-150 hover:bg-zinc-50"
            >
              <div className="pa-funnel-builder-create-icon flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-xl font-bold text-zinc-700">
                +
              </div>
              <div className="mt-3 text-base font-semibold text-brand-ink">Create funnel</div>
              <div className="mt-1 text-sm text-zinc-600">Start from a guided scaffold or a custom draft, then refine the funnel in the builder.</div>
            </button>

            {(funnels || []).map((f) => {
              const assignedDomainClean = String(f.assignedDomain || "").trim().toLowerCase();
              const assignedDomainStatus = getAssignedDomainStatus(assignedDomainClean);
              const hasVerifiedCustomDomain = assignedDomainClean && assignedDomainStatus === "VERIFIED";
              const builderHref = `${basePath}/app/services/funnel-builder/funnels/${encodeURIComponent(f.id)}/edit`;
              const previewHref = toRuntimeHostedUrl(hostedFunnelPath(f.slug, f.id) || `/f/${encodeURIComponent(f.slug)}`, runtimeHostedOrigin);
              const liveHrefRaw = hasVerifiedCustomDomain
                ? getFunnelLiveHref(f.assignedDomain, f.slug, f.id)
                : assignedDomainClean
                  ? null
                  : getFunnelLiveHref(null, f.slug, f.id);
              const liveHref = f.status === "ACTIVE" ? liveHrefRaw : null;
              const liveUrlLabel = assignedDomainClean ? "Custom domain URL" : "Hosted URL";
              const liveUrlDisplay = assignedDomainClean
                ? isLocalPreview
                  ? `${platformTargetHost || ""}/domain-router/${assignedDomainClean}/${f.slug}`
                  : `https://${assignedDomainClean}/${f.slug}`
                : previewHref;

              return (
                <div
                  key={f.id}
                  className="pa-funnel-builder-card group rounded-3xl border border-zinc-200 bg-white p-6 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                >
                  <div className="text-base font-semibold text-brand-ink">{f.name}</div>
                  <div className="mt-1 text-sm text-zinc-600">/{f.slug}</div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      href={builderHref}
                      className={classNames(
                        "pa-funnel-builder-primary-action inline-flex items-center gap-2 rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95",
                        FUNNEL_BUTTON_MOTION_CLASS,
                        FUNNEL_BUTTON_RAISE_CLASS,
                      )}
                    >
                      <IconEdit size={16} />
                      Open builder
                    </Link>
                    <Link
                      href={previewHref}
                      target="_blank"
                      className={classNames(
                        "pa-funnel-builder-secondary-action inline-flex items-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50",
                        FUNNEL_BUTTON_MOTION_CLASS,
                        FUNNEL_BUTTON_SUBTLE_RAISE_CLASS,
                      )}
                    >
                      Preview
                    </Link>
                    {liveHref ? (
                      <Link
                        href={liveHref}
                        target="_blank"
                        className={classNames(
                          "pa-funnel-builder-live-action inline-flex items-center rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100",
                          FUNNEL_BUTTON_MOTION_CLASS,
                          FUNNEL_BUTTON_SUBTLE_RAISE_CLASS,
                        )}
                      >
                        Open live
                      </Link>
                    ) : (
                      <span
                        className="pa-funnel-builder-live-disabled inline-flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-500"
                        title={
                          f.status !== "ACTIVE"
                            ? "Set this funnel to Live to enable the public link."
                            : assignedDomainClean
                              ? "This domain is pending DNS verification. Verify DNS to enable the live link."
                              : "Live link is currently unavailable."
                        }
                      >
                        Live unavailable
                      </span>
                    )}
                  </div>

                  <div className="pa-funnel-builder-delivery-panel mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Delivery</div>
                    <div className="mt-3 flex flex-col gap-3">
                      <PortalListboxDropdown
                        value={String(f.assignedDomain || "")}
                        disabled={!!funnelDomainBusy[f.id] || !domains}
                        options={funnelDomainOptions}
                        onChange={(v) => patchFunnelDomain(f, v ? v : null)}
                        buttonClassName="pa-funnel-builder-delivery-select flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
                        placeholder="Default (not assigned)"
                      />

                      <div className="min-w-0 text-xs text-zinc-600">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{liveUrlLabel}</div>
                        <div className="mt-1 flex min-w-0 items-start gap-2">
                          <div
                            className={classNames(
                              "pa-funnel-builder-delivery-url min-w-0 flex-1 truncate rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono leading-5",
                              assignedDomainClean && assignedDomainStatus !== "VERIFIED" ? "text-zinc-400" : "text-zinc-700",
                            )}
                            title={liveUrlDisplay}
                          >
                            {liveUrlDisplay}
                          </div>
                          <button
                            type="button"
                            onClick={() => copyText(liveUrlDisplay)}
                            className="pa-funnel-builder-delivery-copy rounded-xl border border-zinc-200 bg-white p-2 text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-900"
                            aria-label="Copy funnel URL"
                            title="Copy URL"
                          >
                            <IconCopy size={16} />
                          </button>
                        </div>
                        {assignedDomainClean && assignedDomainStatus !== "VERIFIED" ? (
                          <div
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                            title="This domain isn’t verified yet (DNS not pointing here or still propagating)."
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                            Pending DNS
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    {(() => {
                      const label = funnelStatusLabel(f, assignedDomainStatus);
                      return (
                        <span
                          className={classNames(
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                            statusPillClass(label),
                          )}
                        >
                          {label}
                        </span>
                      );
                    })()}
                    <div className="relative">
                      <div
                        ref={openFunnelMenuId === f.id ? funnelMenuRootRef : undefined}
                        className="relative"
                      >
                        <button
                          type="button"
                          aria-label="Funnel actions"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenFunnelMenuId((prev) => (prev === f.id ? null : f.id));
                          }}
                          className="pa-portal-glass-button grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition-colors duration-150 hover:bg-zinc-50"
                        >
                          <DotsIcon className="h-5 w-5" />
                        </button>

                        {openFunnelMenuId === f.id ? (
                          <LiquidGlassPopupSurface
                            ref={funnelMenuElRef}
                            className={classNames(
                              "fixed z-40 w-60 overflow-hidden rounded-[26px]",
                              funnelMenuStyle?.anchorId === f.id ? "opacity-100" : "pointer-events-none opacity-0",
                            )}
                            style={
                              funnelMenuStyle?.anchorId === f.id
                                ? { top: funnelMenuStyle.top, left: funnelMenuStyle.left, maxHeight: funnelMenuStyle.maxHeight }
                                : undefined
                            }
                          >
                            <div>
                            <div className={builderActionMenuLabelClass}>Actions</div>

                            <div className={builderActionMenuSectionClass}>
                              <Link
                                href={builderHref}
                                target="_blank"
                                className={builderActionMenuItemClass}
                                onClick={() => setOpenFunnelMenuId(null)}
                                aria-label="Edit"
                                title="Edit"
                              >
                                <span className={builderActionMenuIconClass} aria-hidden="true">
                                  <IconEdit size={16} />
                                </span>
                                <span className={builderActionMenuTitleClass}>Edit</span>
                              </Link>

                              <Link
                                href={previewHref}
                                target="_blank"
                                className={builderActionMenuItemClass}
                                onClick={() => setOpenFunnelMenuId(null)}
                              >
                                <span className={builderActionMenuIconClass} aria-hidden="true">↗</span>
                                <span className={builderActionMenuTitleClass}>Preview</span>
                              </Link>

                              {liveHref ? (
                                <Link
                                  href={liveHref}
                                  target="_blank"
                                  className={builderActionMenuItemClass}
                                  onClick={() => setOpenFunnelMenuId(null)}
                                >
                                  <span className={builderActionMenuIconClass} aria-hidden="true">●</span>
                                  <span className={builderActionMenuTitleClass}>Open live</span>
                                </Link>
                              ) : (
                                <div
                                  className={classNames(builderActionMenuItemClass, builderActionMenuMutedClass)}
                                  title={
                                    f.status !== "ACTIVE"
                                      ? "Set this funnel to Live to enable the live link."
                                      : assignedDomainClean
                                        ? "This domain is pending DNS verification. Verify DNS to enable the Live link."
                                        : "Live link is currently unavailable."
                                  }
                                >
                                    <span className={builderActionMenuIconClass} aria-hidden="true">●</span>
                                    <span className={builderActionMenuTitleClass}>Open live</span>
                                </div>
                              )}

                                <div className={builderActionMenuSeparatorClass} />

                              {f.status !== "ARCHIVED" ? (
                                <button
                                  type="button"
                                  disabled={!!funnelStatusBusy[f.id]}
                                  onClick={() => {
                                    const next = f.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
                                    void (async () => {
                                      const ok = await patchFunnelStatus(f, next);
                                      if (ok) setOpenFunnelMenuId(null);
                                    })();
                                  }}
                                  className={classNames(
                                    builderActionMenuItemClass,
                                    f.status === "ACTIVE" ? "" : builderActionMenuSuccessClass,
                                    funnelStatusBusy[f.id] ? "opacity-60" : "",
                                  )}
                                >
                                  <span className={builderActionMenuIconClass} aria-hidden="true">⇄</span>
                                  <span className={builderActionMenuTitleClass}>{f.status === "ACTIVE" ? "Set status: Draft" : "Set status: Live"}</span>
                                </button>
                              ) : (
                                <div className={classNames(builderActionMenuItemClass, builderActionMenuMutedClass)}>
                                  <span className={builderActionMenuIconClass} aria-hidden="true">•</span>
                                  <span className={builderActionMenuTitleClass}>Status: Archived</span>
                                </div>
                              )}

                              <div className={builderActionMenuSeparatorClass} />

                              <button
                                type="button"
                                disabled={!!funnelDeleteBusy[f.id]}
                                onClick={() => {
                                  if (funnelDeleteBusy[f.id]) return;
                                  setDeleteDialog({ type: "funnel", id: f.id });
                                  setOpenFunnelMenuId(null);
                                }}
                                className={classNames(
                                  builderActionMenuItemClass,
                                  builderActionMenuDangerClass,
                                  funnelDeleteBusy[f.id] ? "opacity-60" : "",
                                )}
                              >
                                <span className={builderActionMenuIconClass} aria-hidden="true">×</span>
                                <span className={builderActionMenuTitleClass}>Delete</span>
                              </button>
                            </div>
                            </div>
                          </LiquidGlassPopupSurface>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {funnels === null ? (
            <div className="mt-6 text-sm text-zinc-600">Loading funnels…</div>
          ) : funnels.length === 0 ? (
            <div className="mt-6 text-sm text-zinc-600">No funnels yet. Create the first funnel to start from a guided structure instead of a blank page.</div>
          ) : null}
        </section>
      ) : null}

      {tab === "forms" ? (
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => openCreate("form")}
              className="group flex min-h-40 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-300 bg-white p-6 text-left transition-colors duration-150 hover:bg-zinc-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-xl font-bold text-zinc-700">
                +
              </div>
              <div className="mt-3 text-base font-semibold text-brand-ink">Create a form</div>
              <div className="mt-1 text-sm text-zinc-600">Host forms and collect submissions.</div>
            </button>

            {(forms || []).map((f) => (
              <div key={f.id} className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-base font-semibold text-brand-ink">{f.name}</div>
                <div className="mt-1 text-sm text-zinc-600">/{f.slug}</div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  {(() => {
                    const label = f.status === "ACTIVE" ? "LIVE" : f.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT";
                    return (
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                          statusPillClass(label),
                        )}
                      >
                        {label}
                      </span>
                    );
                  })()}
                  <div className="relative">
                    <div ref={openFormMenuId === f.id ? formMenuRootRef : undefined} className="relative">
                      <button
                        type="button"
                        aria-label="Form actions"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenFormMenuId((prev) => (prev === f.id ? null : f.id));
                        }}
                        className="pa-portal-glass-button grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition-colors duration-150 hover:bg-zinc-50"
                      >
                        <DotsIcon className="h-5 w-5" />
                      </button>

                      {openFormMenuId === f.id ? (
                        <LiquidGlassPopupSurface
                          ref={formMenuElRef}
                          className={classNames(
                            "fixed z-40 w-60 overflow-hidden rounded-[26px]",
                            formMenuStyle?.anchorId === f.id ? "opacity-100" : "pointer-events-none opacity-0",
                          )}
                          style={
                            formMenuStyle?.anchorId === f.id
                              ? { top: formMenuStyle.top, left: formMenuStyle.left, maxHeight: formMenuStyle.maxHeight }
                              : undefined
                          }
                        >
                          <div>
                          <div className={builderActionMenuLabelClass}>Actions</div>
                          <div className={builderActionMenuSectionClass}>
                            <Link
                              href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/edit`}
                              target="_blank"
                              className={builderActionMenuItemClass}
                              onClick={() => setOpenFormMenuId(null)}
                              aria-label="Edit"
                              title="Edit"
                            >
                              <span className={builderActionMenuIconClass} aria-hidden="true">
                                <IconEdit size={16} />
                              </span>
                              <span className={builderActionMenuTitleClass}>Edit</span>
                            </Link>
                            <Link
                              href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/responses`}
                              target="_blank"
                              className={builderActionMenuItemClass}
                              onClick={() => setOpenFormMenuId(null)}
                            >
                              <span className={builderActionMenuIconClass} aria-hidden="true">#</span>
                              <span className={builderActionMenuTitleClass}>Responses</span>
                            </Link>
                            <Link
                              href={getFormPreviewHref(f.slug, f.id) || toRuntimeHostedUrl(`/forms/${encodeURIComponent(f.slug)}`, runtimeHostedOrigin)}
                              target="_blank"
                              className={builderActionMenuItemClass}
                              onClick={() => setOpenFormMenuId(null)}
                            >
                              <span className={builderActionMenuIconClass} aria-hidden="true">↗</span>
                              <span className={builderActionMenuTitleClass}>Preview</span>
                            </Link>

                            {f.status === "ACTIVE" ? (
                              <Link
                                href={getFormLiveHref(f.slug, f.id) || toRuntimeHostedUrl(`/forms/${encodeURIComponent(f.slug)}`, runtimeHostedOrigin)}
                                target="_blank"
                                className={builderActionMenuItemClass}
                                onClick={() => setOpenFormMenuId(null)}
                              >
                                <span className={builderActionMenuIconClass} aria-hidden="true">●</span>
                                <span className={builderActionMenuTitleClass}>Open live</span>
                              </Link>
                            ) : (
                              <div
                                className={classNames(builderActionMenuItemClass, builderActionMenuMutedClass)}
                                title={f.status === "ARCHIVED" ? "Archived forms do not expose a public live route." : "Set this form to Live to enable the public hosted link."}
                              >
                                <span className={builderActionMenuIconClass} aria-hidden="true">●</span>
                                <span className={builderActionMenuTitleClass}>Open live</span>
                              </div>
                            )}

                            <div className={builderActionMenuSeparatorClass} />

                            <button
                              type="button"
                              disabled={!!formSaveBusy[f.id]}
                              onClick={() => {
                                setFormSettingsError(null);
                                setFormSettingsDialog({ id: f.id, name: f.name, slug: f.slug, status: f.status });
                                setOpenFormMenuId(null);
                              }}
                              className={classNames(
                                builderActionMenuItemClass,
                                formSaveBusy[f.id] ? "opacity-60" : "",
                              )}
                            >
                              <span className={builderActionMenuIconClass} aria-hidden="true">⇄</span>
                              <span className={builderActionMenuTitleClass}>Route & status</span>
                            </button>

                            <button
                              type="button"
                              disabled={!!formDeleteBusy[f.id]}
                              onClick={() => {
                                if (formDeleteBusy[f.id]) return;
                                setDeleteDialog({ type: "form", id: f.id });
                                setOpenFormMenuId(null);
                              }}
                              className={classNames(
                                builderActionMenuItemClass,
                                builderActionMenuDangerClass,
                                formDeleteBusy[f.id] ? "opacity-60" : "",
                              )}
                            >
                              <span className={builderActionMenuIconClass} aria-hidden="true">×</span>
                              <span className={builderActionMenuTitleClass}>Delete</span>
                            </button>
                          </div>
                          </div>
                        </LiquidGlassPopupSurface>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {forms === null ? (
            <div className="mt-6 text-sm text-zinc-600">Loading forms…</div>
          ) : forms.length === 0 ? (
            <div className="mt-6 text-sm text-zinc-600">No forms yet. Click the plus card to create one.</div>
          ) : null}
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="mt-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Payments (Stripe)</div>
            <p className="mt-1 text-sm text-zinc-600">Connect Stripe to use the Checkout block and sell inside funnels.</p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-700">
                {stripeStatusBusy ? (
                  <span className="text-zinc-500">Checking Stripe status…</span>
                ) : stripeStatus?.configured ? (
                  <span>
                    Connected
                    {stripeStatus.accountId ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        Account: <span className="font-mono text-zinc-800">{stripeStatus.accountId}</span>
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-zinc-500">Not connected</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`${basePath}/app/settings/integrations`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-zinc-50"
                >
                  Stripe settings
                </Link>
                {!stripeStatusBusy && !stripeStatus?.configured ? (
                  <Link
                    href={`${basePath}/app/settings/integrations`}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-95"
                  >
                    Connect Stripe
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-brand-ink">Tracking and Meta Pixel</div>
                <p className="mt-1 text-sm text-zinc-600">
                  Set the default Meta pixel for hosted funnel pages. The editor shows the resolved pixel and live event counts per page.
                </p>
              </div>
              <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                {builderSettingsBusy ? "Loading…" : normalizedMetaPixelIdInput ? "Configured" : "Not configured"}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Meta pixel ID</div>
                <input
                  value={metaPixelIdInput}
                  onChange={(e) => setMetaPixelIdInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 32))}
                  placeholder="123456789012345"
                  inputMode="numeric"
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </label>

              <div className="mt-2 text-xs leading-5 text-zinc-500">
                Leave this blank to disable Meta pixel emission across hosted funnel pages. Only numeric pixel IDs are accepted.
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-zinc-500">
                  {builderSettingsBusy
                    ? "Loading current tracking settings…"
                    : normalizedMetaPixelIdInput
                      ? `Current default pixel: ${normalizedMetaPixelIdInput}`
                      : "No default Meta pixel is configured."}
                </div>
                <button
                  type="button"
                  disabled={builderSettingsBusy || builderSettingsSaveBusy || !metaPixelDirty}
                  onClick={() => void saveBuilderSettings()}
                  className={classNames(
                    "rounded-2xl px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150",
                    builderSettingsBusy || builderSettingsSaveBusy || !metaPixelDirty
                      ? "bg-zinc-400"
                      : "bg-brand-ink hover:opacity-95",
                  )}
                >
                  {builderSettingsSaveBusy ? "Saving…" : metaPixelDirty ? "Save pixel" : "Saved"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Custom domains</div>
            <p className="mt-1 text-sm text-zinc-600">
              Save the domain you want to use for funnels/forms. DNS verification + automatic provisioning is the next step.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="example.com"
                className="w-full flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
              <button
                type="button"
                disabled={domainBusy || !domainSig || !domainDirty}
                onClick={saveDomain}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150",
                  domainBusy || !domainSig || !domainDirty ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                )}
              >
                {domainBusy ? "Saving…" : domainSig && !domainDirty ? "Saved" : "Save"}
              </button>
            </div>

            <div className="mt-5">
              {domains === null ? (
                <div className="text-sm text-zinc-600">Loading domains…</div>
              ) : domains.length === 0 ? (
                <div className="text-sm text-zinc-600">No domains saved yet.</div>
              ) : (
                <div className="space-y-2">
                  {domains.map((d) => (
                    <div key={d.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{d.domain}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                          <div>
                            Status: {d.status}
                            {d.verifiedAt ? ` · Verified ${new Date(d.verifiedAt).toLocaleDateString()}` : ""}
                          </div>
                          <button
                            type="button"
                            disabled={!!domainVerifyBusy[d.id]}
                            onClick={() => verifyDomain(d)}
                            className={classNames(
                              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150",
                              domainVerifyBusy[d.id]
                                ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            {domainVerifyBusy[d.id] ? "Verifying…" : d.status === "VERIFIED" ? "Re-check DNS" : "Verify DNS"}
                          </button>
                        </div>

                        {(domainVercelVerificationById[d.id] || []).length ? (
                          <details className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hosting verification</div>
                                <div className="mt-0.5 text-xs text-zinc-600">TXT records needed before SSL can go live.</div>
                              </div>
                              <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
                                {(domainVercelVerificationById[d.id] || []).length} record{(domainVercelVerificationById[d.id] || []).length === 1 ? "" : "s"}
                              </span>
                            </summary>
                            <div className="border-t border-zinc-100 px-3 pb-3 pt-2.5">
                              <div className="text-xs text-zinc-600">
                                Add these in your DNS provider, then click <span className="font-semibold">Verify DNS</span>.
                              </div>
                              <div className="mt-2 overflow-auto">
                              <table className="w-full min-w-140 border-separate border-spacing-0">
                                <thead>
                                  <tr>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Type</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Host / Name</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {domainVercelVerificationById[d.id].map((r, idx) => {
                                    const host = deriveVerificationHostLabels(r.host, d.domain);
                                    const displayHost = host.display || r.host;
                                    const showFull = host.full && host.full !== displayHost;
                                    return (
                                      <tr key={`${r.type}:${r.host}:${idx}`}>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <span className="font-semibold text-zinc-900">{r.type}</span>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="flex flex-col gap-1">
                                            <div className="inline-flex items-center gap-2">
                                              <span className="font-mono text-zinc-800">{displayHost}</span>
                                              <button
                                                type="button"
                                                onClick={() => copyText(displayHost)}
                                                className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-900"
                                                aria-label="Copy host/name"
                                                title="Copy"
                                              >
                                                <IconCopy size={16} />
                                              </button>
                                              {showFull ? (
                                                <button
                                                  type="button"
                                                  onClick={() => copyText(host.full)}
                                                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-900"
                                                  aria-label="Copy full host/name"
                                                  title="Copy full host"
                                                >
                                                  Copy full
                                                </button>
                                              ) : null}
                                            </div>
                                            {showFull ? <div className="font-mono text-[10px] text-zinc-500">Full: {host.full}</div> : null}
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">{r.value}</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText(r.value)}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <IconCopy size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            </div>
                          </details>
                        ) : null}

                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Root / behavior</div>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <PortalListboxDropdown<RootMode>
                              value={(d.rootMode || "DIRECTORY") as RootMode}
                              disabled={!!domainSettingsBusy[d.id]}
                              options={[
                                { value: "DIRECTORY", label: "Show directory page" },
                                {
                                  value: "REDIRECT",
                                  label: "Redirect / to a funnel",
                                  disabled: !!funnels && funnels.length === 0,
                                },
                                { value: "DISABLED", label: "Disable / (404)" },
                              ]}
                              onChange={(nextMode) => {
                                if (nextMode === "REDIRECT") {
                                  const eligibleFunnels = (funnels || []).filter((f) => {
                                    const assigned = (f.assignedDomain || "").trim().toLowerCase();
                                    if (!assigned) return true;
                                    return assigned === d.domain;
                                  });
                                  const fallbackSlug =
                                    eligibleFunnels.find((f) => f.status === "ACTIVE")?.slug || eligibleFunnels[0]?.slug || null;
                                  patchDomainSettings(d, { rootMode: "REDIRECT", rootFunnelSlug: d.rootFunnelSlug || fallbackSlug });
                                  return;
                                }
                                patchDomainSettings(d, { rootMode: nextMode, rootFunnelSlug: null });
                              }}
                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 sm:w-[240px]"
                            />

                            {(d.rootMode || "DIRECTORY") === "REDIRECT" ? (
                              <PortalListboxDropdown
                                value={String(d.rootFunnelSlug || "")}
                                disabled={!!domainSettingsBusy[d.id] || !funnels || funnels.length === 0}
                                options={[
                                  { value: "", label: "Select a funnel…", disabled: true },
                                  ...(funnels || [])
                                    .filter((f) => {
                                      const assigned = (f.assignedDomain || "").trim().toLowerCase();
                                      if (!assigned) return true;
                                      return assigned === d.domain;
                                    })
                                    .map((f) => ({ value: f.slug, label: `${f.name} (/${f.slug})` })),
                                ]}
                                onChange={(v) => {
                                  const slug = normalizeSlug(String(v || ""));
                                  patchDomainSettings(d, { rootMode: "REDIRECT", rootFunnelSlug: slug || null });
                                }}
                                buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
                                placeholder="Select a funnel…"
                              />
                            ) : null}
                          </div>

                          <div className="mt-2 text-xs text-zinc-600">
                            Requests to <span className="font-mono">https://{d.domain}/</span> follow this rule.
                            Funnel slugs work at <span className="font-mono">/{"{slug}"}</span> and <span className="font-mono">/f/{"{slug}"}</span> for funnels assigned to this domain.
                          </div>
                        </div>

                        <details className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">DNS records to add</div>
                              <div className="mt-0.5 text-xs text-zinc-600">Open for the exact Type, Host, and Value fields.</div>
                            </div>
                            <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
                              Setup
                            </span>
                          </summary>
                          <div className="border-t border-zinc-100 px-3 pb-3 pt-2.5">
                            {isLikelyApexDomain(d.domain) ? (
                              <div className="text-xs text-zinc-600">
                                For the root (<span className="font-mono">@</span>), use <span className="font-semibold">either</span> an <span className="font-semibold">ALIAS/ANAME</span> <span className="font-semibold">or</span> an <span className="font-semibold">A record</span>.
                              </div>
                            ) : null}
                            {platformTargetHost ? (
                              <div className="mt-2 overflow-auto">
                              <table className="w-full min-w-130 border-separate border-spacing-0">
                                <thead>
                                  <tr>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Type</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Host / Name</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {!isLikelyApexDomain(d.domain) ? (
                                    <tr>
                                      <td className="border-b border-zinc-100 py-2 text-xs">
                                        <span className="font-semibold text-zinc-900">CNAME</span>
                                      </td>
                                      <td className="border-b border-zinc-100 py-2 text-xs">
                                        <div className="inline-flex items-center gap-2">
                                          <span className="font-mono text-zinc-800">{deriveDnsHostLabel(d.domain)}</span>
                                          <button
                                            type="button"
                                            onClick={() => copyText(deriveDnsHostLabel(d.domain))}
                                            className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                            aria-label="Copy host/name"
                                            title="Copy"
                                          >
                                            <IconCopy size={16} />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="border-b border-zinc-100 py-2 text-xs">
                                        <div className="inline-flex items-center gap-2">
                                          <span className="font-mono text-zinc-800">{platformTargetHost}</span>
                                          <button
                                            type="button"
                                            onClick={() => copyText(platformTargetHost)}
                                            className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                            aria-label="Copy value"
                                            title="Copy"
                                          >
                                            <IconCopy size={16} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : (
                                    <>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <span className="font-semibold text-zinc-900">ALIAS / ANAME</span>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">@</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("@")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy host/name"
                                              title="Copy"
                                            >
                                              <IconCopy size={16} />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">{platformTargetHost}</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText(platformTargetHost)}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <IconCopy size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="flex items-baseline gap-1">
                                            <span className="font-semibold text-zinc-900">A</span>
                                            <span className="text-[10px] font-semibold text-zinc-500">record (alternative)</span>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">@</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("@")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy host/name"
                                              title="Copy"
                                            >
                                              <IconCopy size={16} />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">76.76.21.21</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("76.76.21.21")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <IconCopy size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <span className="font-semibold text-zinc-900">CNAME</span>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">www</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("www")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy host/name"
                                              title="Copy"
                                            >
                                              <IconCopy size={16} />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">{platformTargetHost}</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText(platformTargetHost)}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <IconCopy size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    </>
                                  )}
                                </tbody>
                              </table>

                              <div className="mt-2 text-xs text-zinc-600">
                                Use the exact <span className="font-semibold">Type</span>, <span className="font-semibold">Host/Name</span>, and <span className="font-semibold">Value</span> fields in your DNS provider, then click <span className="font-semibold">Verify DNS</span> above.
                              </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-zinc-600">Loading DNS target…</div>
                            )}
                          </div>
                        </details>
                      </div>
                      <div className="text-xs text-zinc-600">
                        Open the DNS sections only when you need the exact records or verification steps.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {creatingKind ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 pa-modal-safe-pad">
          <div className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-brand-ink">{creatingKind === "funnel" ? "Create funnel" : "Create form"}</div>
                <p className="mt-1 text-sm text-zinc-600">
                  {creatingKind === "funnel"
                    ? "Shape a quick working brief now, close it if you need to, and only lock it in when you hit Create."
                    : "Choose a URL slug. You can rename it later."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                disabled={busy}
                aria-label="Close create"
                title="Close"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-lg font-semibold text-zinc-700 transition-colors duration-150 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-60"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {creatingKind === "form" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
                    <input
                      value={createSlug}
                      onChange={(e) => setCreateSlug(e.target.value)}
                      placeholder="intake"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                    />
                    <div className="mt-1 text-xs text-zinc-500">
                      Public slug: {formPublicBase}/<span className="font-semibold">{normalizeSlug(createSlug) || "…"}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">After creation, Preview and Live use the exact hosted link with the form key.</div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name (optional)</div>
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Client Intake Form"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                    />
                  </div>
                </div>
              ) : null}

              {creatingKind === "funnel" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug (optional)</div>
                      <input
                        value={createSlug}
                        onChange={(e) => setCreateSlug(e.target.value)}
                        placeholder={funnelCreateNamingPreview?.slug || "my-funnel"}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                      />
                      <div className="mt-1 text-xs text-zinc-500">
                        Suggested path: /<span className="font-semibold">{normalizeSlug(createSlug) || funnelCreateNamingPreview?.slug || "…"}</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name (optional)</div>
                      <input
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder={funnelCreateNamingPreview?.name || "Lead capture funnel"}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafaf9_100%)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Business intake</div>
                        <div className="mt-1 text-base font-semibold text-zinc-950">Turn rough business context into a usable first brief.</div>
                        <div className="mt-1 text-sm leading-6 text-zinc-600">
                          {createBusinessProfileSummary
                            ? "Saved company context is already loaded. Add only what is specific to this funnel, offer, or audience shift."
                            : "If there is no formal brief yet, answer this like a strategist is interviewing the owner. The builder can work from plain-language answers, and you can pick this back up later."}
                        </div>
                      </div>
                      <div className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700">
                        {funnelCreateInterviewSignals.filter((item) => item.done).length}/{funnelCreateInterviewSignals.length} signals loaded
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-600">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-zinc-900">This is a working intake, not a locked survey.</div>
                        <div className="mt-1 leading-6">Your notes sync to this workspace while you work. Nothing becomes effective until you submit the funnel creation.</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700">
                          {formatRelativeAutosaveLabel(createFunnelDraftSavedAt)}
                        </div>
                        <button
                          type="button"
                          onClick={clearCreateFunnelDraft}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          Clear saved draft
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Soft checkpoints</div>
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                        {funnelCreateStageItems.map((stage, index) => {
                          const active = createFunnelStage === stage.key;
                          return (
                            <button
                              key={stage.key}
                              type="button"
                              onClick={() => setCreateFunnelStage(stage.key)}
                              className={classNames(
                                "rounded-2xl border px-4 py-3 text-left transition-colors",
                                active
                                  ? "border-blue-200 bg-blue-50 text-blue-950"
                                  : stage.done
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Step {index + 1}</span>
                                <span className="text-[11px] font-semibold">{stage.done ? "Ready" : active ? "In progress" : "Open"}</span>
                              </div>
                              <div className="mt-2 text-sm font-semibold">{stage.label}</div>
                              <div className="mt-1 text-xs leading-5 opacity-80">{stage.hint}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {funnelCreateInterviewSignals.map((item) => (
                        <div
                          key={item.label}
                          className={classNames(
                            "rounded-full border px-3 py-1.5 text-xs font-semibold",
                            item.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-500",
                          )}
                        >
                          {item.done ? "Ready" : "Need signal"} · {item.label}
                        </div>
                      ))}
                    </div>

                    {createBusinessProfileSummary ? (
                      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">Using saved business profile</div>
                        <div className="mt-1 font-semibold">{createBusinessProfileSummary.businessName || "Business context loaded"}</div>
                        <div className="mt-1 leading-6 text-blue-900/80">
                          {[
                            createBusinessProfileSummary.industry,
                            createBusinessProfileSummary.businessModel,
                            createBusinessProfileSummary.targetCustomer,
                            createBusinessProfileSummary.brandVoice,
                          ].filter(Boolean).join(" · ") || "The builder will inherit the stored company context from your business profile."}
                        </div>
                        {createBusinessProfileSummary.primaryGoals.length ? (
                          <div className="mt-2 text-xs leading-5 text-blue-900/75">Goals: {createBusinessProfileSummary.primaryGoals.join("; ")}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                        No saved company brief was found. Use the questions below to give the builder the raw material it needs.
                      </div>
                    )}
                    {createFunnelStage === "business" ? (
                      <>
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What should this funnel do?</div>
                            <PortalListboxDropdown<FunnelPageIntentType>
                              value={createFunnelPageType}
                              onChange={(value) => applyFunnelCreatePageType(value)}
                              options={FUNNEL_PAGE_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label, hint: option.hint }))}
                              buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                            />
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">First draft path</div>
                            <div className="mt-1 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
                              <button
                                type="button"
                                onClick={() => setCreateFunnelPreferCustomMode(false)}
                                className={classNames(
                                  "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                  !createFunnelPreferCustomMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:bg-white/70",
                                )}
                              >
                                Guided scaffold
                              </button>
                              <button
                                type="button"
                                onClick={() => setCreateFunnelPreferCustomMode(true)}
                                className={classNames(
                                  "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                  createFunnelPreferCustomMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:bg-white/70",
                                )}
                              >
                                Custom draft
                              </button>
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {createFunnelPreferCustomMode
                                ? "Start with a simple draft page and shape the structure yourself from chat or source."
                                : "Let the builder seed the first draft with the strongest scaffold it can infer from the offer."}
                            </div>
                          </div>
                        </div>

                        <label className="mt-4 block">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What should the builder understand about this business before it chooses structure?</div>
                            <button
                              type="button"
                              onClick={() => startCreateIntakeDictation("companyContext", createFunnelCompanyContext)}
                              disabled={!createIntakeDictationSupported && createIntakeDictatingFieldKey !== "companyContext"}
                              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                              title={createIntakeDictationSupported ? (createIntakeDictatingFieldKey === "companyContext" ? "Stop dictation" : "Use the mic for business context") : "Speech-to-text is not available in this browser"}
                            >
                              {createIntakeDictatingFieldKey === "companyContext" ? "Stop mic" : "Use mic"}
                            </button>
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">Use the mic when typing would flatten detail. Speaking usually gives clearer nuance about delivery, objections, proof, and why buyers move.</div>
                          <textarea
                            value={createFunnelCompanyContext}
                            onChange={(e) => {
                              setCreateFunnelCompanyContext(e.target.value);
                              if (createIntakeDictationError) setCreateIntakeDictationError(null);
                            }}
                            rows={5}
                            placeholder="Describe the business in plain language: what you sell, who it works best for, what makes it credible, where leads usually get stuck, and anything this funnel should respect."
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {FUNNEL_CREATE_CONTEXT_PROMPTS.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => appendCreateContextPrompt(prompt)}
                              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>

                        <label className="mt-4 block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            What are you offering? <span className="text-red-500">*</span>
                          </div>
                          <input
                            autoFocus
                            value={createFunnelOffer}
                            onChange={(e) => setCreateFunnelOffer(e.target.value)}
                            placeholder="e.g. Free strategy call, credit audit, marketing consultation"
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>
                      </>
                    ) : null}

                    {createFunnelStage === "audience" ? (
                      <>
                        <label className="mt-4 block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Who is this for?</div>
                          <input
                            value={createFunnelAudience}
                            onChange={(e) => setCreateFunnelAudience(e.target.value)}
                            placeholder="e.g. local business owners, warm leads, people who already know the offer"
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="mt-1 text-xs text-zinc-500">
                            {createBusinessProfileSummary?.targetCustomer
                              ? `Saved audience signal: ${createBusinessProfileSummary.targetCustomer}`
                              : "Use this to tell the builder who should feel seen by the first screen."}
                          </div>
                        </label>

                        <label className="mt-4 block">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What should this funnel qualify, collect, or decide before someone moves forward?</div>
                            <button
                              type="button"
                              onClick={() => startCreateIntakeDictation("qualificationFields", createFunnelQualificationFields)}
                              disabled={!createIntakeDictationSupported && createIntakeDictatingFieldKey !== "qualificationFields"}
                              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                              title={createIntakeDictationSupported ? (createIntakeDictatingFieldKey === "qualificationFields" ? "Stop dictation" : "Use the mic for qualification notes") : "Speech-to-text is not available in this browser"}
                            >
                              {createIntakeDictatingFieldKey === "qualificationFields" ? "Stop mic" : "Use mic"}
                            </button>
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">Use the mic here if routing or qualification logic is easier to explain out loud than to structure as a list.</div>
                          <textarea
                            value={createFunnelQualificationFields}
                            onChange={(e) => {
                              setCreateFunnelQualificationFields(e.target.value);
                              if (createIntakeDictationError) setCreateIntakeDictationError(null);
                            }}
                            rows={4}
                            placeholder="Examples: budget range, readiness, service type, location, timeline, team size, booking handoff, tags to apply, or any routing logic."
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>
                      </>
                    ) : null}

                    {createFunnelStage === "conversion" ? (
                      <>
                        <label className="mt-4 block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What outcome should this funnel win?</div>
                          <textarea
                            value={createFunnelGoal}
                            onChange={(e) => setCreateFunnelGoal(e.target.value)}
                            rows={3}
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>

                        <label className="mt-4 block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What should the visitor do next?</div>
                          <input
                            value={createFunnelPrimaryCta}
                            onChange={(e) => setCreateFunnelPrimaryCta(e.target.value)}
                            placeholder="e.g. Book a call, Get the guide, Reserve your seat"
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>

                        <div className="mt-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Suggested next-step language</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {buildPrimaryCtaSuggestions(createFunnelPageType, createFunnelPrimaryCta).slice(0, 3).map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onClick={() => setCreateFunnelPrimaryCta(suggestion)}
                                className={classNames(
                                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                                  createFunnelPrimaryCta.trim() === suggestion
                                    ? "border-blue-200 bg-blue-50 text-blue-900"
                                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                                )}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                      <div>{createIntakeDictatingFieldKey ? "Listening now. Speak naturally and the notes will be appended into the active field." : "Keep this quick. Save the precise logic that changes how the funnel should be built."}</div>
                      <div>
                        {createIntakeDictationSupported
                          ? "Mic input is best when you need richer detail, not longer copy."
                          : "Speech-to-text depends on browser support and microphone permission."}
                      </div>
                    </div>

                    {createIntakeDictationError ? (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{createIntakeDictationError}</div>
                    ) : null}

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <button
                        type="button"
                        onClick={goToPreviousCreateFunnelStage}
                        disabled={activeCreateFunnelStageIndex === 0}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40"
                      >
                        Back
                      </button>
                      {activeCreateFunnelStageIndex < FUNNEL_CREATE_STAGE_ORDER.length - 1 ? (
                        <button
                          type="button"
                          onClick={goToNextCreateFunnelStage}
                          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                        >
                          {activeCreateFunnelStageComplete ? "Continue" : "Keep this rough and continue"}
                        </button>
                      ) : (
                        <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700">
                          Final checkpoint before create
                        </div>
                      )}
                    </div>
                  </div>

                  {createFunnelStage === "conversion" && funnelInitializationDecision ? (
                    <div
                      className={classNames(
                        "rounded-2xl border px-4 py-3",
                        funnelInitializationDecision.confidence === "low"
                          ? "border-amber-200 bg-amber-50/80"
                          : funnelInitializationDecision.mode === "stencil"
                            ? "border-blue-200 bg-blue-50/80"
                            : "border-zinc-200 bg-zinc-50",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommended first draft</div>
                          <div className="mt-1 text-sm font-semibold text-zinc-900">
                            {funnelInitializationDecision.mode === "stencil"
                              ? `Seed the draft with the ${funnelInitializationDecision.label} scaffold`
                              : "Start from a custom draft"}
                          </div>
                          <div className="mt-1 text-sm text-zinc-700">
                            {funnelInitializationDecision.mode === "stencil"
                              ? `When you click Create, the builder will open with a ${(funnelInitializationDecision.label || "guided").toLowerCase()} first draft already seeded.`
                              : "When you click Create, the builder will open with one simple page and leave the structure decisions to you."}
                          </div>
                          <div className="mt-1 text-sm text-zinc-600">Until then, this stays a resumable workspace draft you can return to.</div>
                          <div className="mt-1 text-sm text-zinc-600">{funnelInitializationDecision.reason}</div>
                          {funnelInitializationDecision.question ? (
                            <div className="mt-2 text-sm font-medium text-amber-900">Before we lock that in: {funnelInitializationDecision.question}</div>
                          ) : null}
                          {funnelCreateNeedsDirectionChoice ? (
                            <div className="mt-2 text-sm font-medium text-amber-900">
                              Pick the closest scaffold below, or switch to Custom draft if you want to shape the first page yourself.
                            </div>
                          ) : null}
                          {funnelInitializationDecision.suggestions.length ? (
                            <div className="mt-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                {funnelCreateNeedsDirectionChoice ? "Pick the closest one" : "Other good starting points"}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                              {funnelInitializationDecision.suggestions.map((suggestion) => (
                                <button
                                  key={suggestion.stencilId}
                                  type="button"
                                  onClick={() => {
                                    applyFunnelCreatePageType(pageTypeFromStencilId(suggestion.stencilId));
                                    setCreateFunnelPreferCustomMode(false);
                                  }}
                                  className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-white"
                                  title={suggestion.reason}
                                >
                                  {funnelCreateNeedsDirectionChoice ? suggestion.label : `Try ${suggestion.label}`}
                                </button>
                              ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                          {formatInitializationConfidence(funnelInitializationDecision.confidence)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {creatingKind === "form" ? (
                <div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Template</div>
                      <PortalListboxDropdown<CreditFormTemplateKey>
                        value={createTemplateKey}
                        onChange={(v) => {
                          setCreateTemplateKey(v);
                          const t = getCreditFormTemplate(v);
                          if (t?.defaultThemeKey) setCreateThemeKey(t.defaultThemeKey);
                        }}
                        options={CREDIT_FORM_TEMPLATES.map((t) => ({ value: t.key, label: t.label, hint: t.description }))}
                        buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                        renderOptionRight={(opt) => {
                          const tmpl = CREDIT_FORM_TEMPLATES.find((t) => t.key === opt.value);
                          const theme = tmpl ? getCreditFormTheme(tmpl.defaultThemeKey) : null;
                          const c = theme?.style?.buttonBg || "#2563eb";
                          return <div aria-hidden="true" className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: c }} />;
                        }}
                      />
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Theme</div>
                      <PortalListboxDropdown<CreditFormThemeKey>
                        value={createThemeKey}
                        onChange={(v) => setCreateThemeKey(v)}
                        options={CREDIT_FORM_THEMES.map((t) => ({ value: t.key, label: t.label, hint: t.description }))}
                        buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                        renderOptionRight={(opt) => {
                          const theme = CREDIT_FORM_THEMES.find((t) => t.key === opt.value);
                          const c = theme?.style?.buttonBg || "#2563eb";
                          return <div aria-hidden="true" className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: c }} />;
                        }}
                      />
                    </div>
                  </div>

                  {(() => {
                    const template = getCreditFormTemplate(createTemplateKey) || CREDIT_FORM_TEMPLATES[0]!;
                    const theme = getCreditFormTheme(createThemeKey) || CREDIT_FORM_THEMES[0]!;
                    return <CreditFormTemplatePreview template={template} theme={theme} className="mt-3" />;
                  })()}
                </div>
              ) : null}

            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={submitCreate}
                disabled={busy || funnelCreateNeedsDirectionChoice}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold text-white transition-all duration-150",
                  busy || funnelCreateNeedsDirectionChoice ? "bg-zinc-400" : "bg-(--color-brand-blue) hover:opacity-95",
                )}
              >
                {busy
                  ? "Creating…"
                  : creatingKind === "funnel"
                    ? funnelCreateNeedsDirectionChoice
                      ? "Pick a starting point first"
                      : formatInitializationActionLabel(funnelInitializationDecision)
                    : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
