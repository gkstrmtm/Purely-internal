export const STEPS = ["Business", "Goals", "Plan", "Services", "Account"] as const;

export type BillingPreference = "credits" | "subscription";
export type PackagePreset = "launch-kit" | "sales-loop" | "brand-builder";
export type CallsPerMonthRange = "NOT_SURE" | "0_10" | "11_30" | "31_60" | "61_120" | "120_PLUS";

export const ACQUISITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Referrals", label: "Referrals" },
  { value: "Google", label: "Google" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "Facebook", label: "Facebook" },
  { value: "Instagram", label: "Instagram" },
  { value: "TikTok", label: "TikTok" },
  { value: "Yelp", label: "Yelp" },
  { value: "Networking", label: "Networking" },
  { value: "Email", label: "Email" },
  { value: "Other", label: "Other" },
];

export const INDUSTRY_SUGGESTIONS = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "Landscaping",
  "Cleaning",
  "Moving",
  "Pest control",
  "Home services",
  "Auto repair",
  "Dental",
  "Chiropractic",
  "Medical",
  "Wellness",
  "Salon / spa",
  "Fitness",
  "Real estate",
  "Property management",
  "Law firm",
  "Accounting",
  "Agency",
  "Ecommerce",
  "Retail",
  "Restaurant",
] as const;

export const BUSINESS_MODEL_SUGGESTIONS = [
  "Local service",
  "Agency",
  "Retail",
  "Product",
  "SaaS",
  "Ecommerce",
  "Professional services",
] as const;

export const INDUSTRY_OPTIONS = INDUSTRY_SUGGESTIONS.map((s) => ({ value: s, label: s }));
export const BUSINESS_MODEL_OPTIONS = BUSINESS_MODEL_SUGGESTIONS.map((s) => ({ value: s, label: s }));

export const GET_STARTED_GOALS = [
  { id: "appointments", label: "Book more appointments" },
  { id: "reviews", label: "Get more reviews" },
  { id: "leads", label: "Get more leads" },
  { id: "followup", label: "Spend less time on follow-up" },
  { id: "content", label: "Publish content regularly (SEO)" },
  { id: "inbox", label: "Keep email + SMS in one inbox" },
  { id: "receptionist", label: "Answer common questions 24/7" },
  { id: "outbound", label: "Do more outbound calling" },
  { id: "unsure", label: "Not sure yet" },
] as const;

export type GetStartedGoalId = (typeof GET_STARTED_GOALS)[number]["id"];

export function normalizeGoalIds(goalIds: unknown): GetStartedGoalId[] {
  if (!Array.isArray(goalIds)) return [];
  const allowed = new Set<string>(GET_STARTED_GOALS.map((g) => g.id));
  const out: GetStartedGoalId[] = [];
  for (const raw of goalIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    if (!allowed.has(id)) continue;
    out.push(id as GetStartedGoalId);
  }
  return Array.from(new Set(out)).slice(0, 10);
}

export function recommendPortalServiceSlugs(goalIds: GetStartedGoalId[]): string[] {
  const weights = new Map<string, number>();

  function bump(slug: string, n: number) {
    weights.set(slug, (weights.get(slug) ?? 0) + n);
  }

  for (const g of goalIds) {
    switch (g) {
      case "appointments":
        bump("booking", 10);
        bump("ai-receptionist", 6);
        bump("automations", 4);
        break;
      case "reviews":
        bump("reviews", 10);
        bump("automations", 2);
        break;
      case "leads":
        bump("lead-scraping", 10);
        bump("automations", 2);
        bump("ai-outbound-calls", 1);
        break;
      case "followup":
        bump("automations", 10);
        break;
      case "content":
        bump("blogs", 10);
        break;
      case "inbox":
        bump("automations", 4);
        bump("ai-receptionist", 2);
        break;
      case "receptionist":
        bump("ai-receptionist", 10);
        bump("automations", 2);
        break;
      case "outbound":
        bump("ai-outbound-calls", 10);
        bump("lead-scraping", 2);
        break;
      case "unsure":
        bump("automations", 2);
        bump("booking", 1);
        break;
    }
  }

  const allowed = new Set([
    "booking",
    "reviews",
    "blogs",
    "automations",
    "ai-receptionist",
    "ai-outbound-calls",
    "lead-scraping",
  ]);

  return Array.from(weights.entries())
    .filter(([slug]) => allowed.has(slug))
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug)
    .slice(0, 4);
}

export type PortalOnboardingPlan = {
  id: string;
  title: string;
  description: string;
  monthlyUsd: number;
  oneTimeUsd?: number;
  quantityConfig?: {
    label: string;
    min: number;
    max: number;
    default: number;
  };
  serviceSlugsToActivate: string[];
  requires?: string[];
  badges?: string[];
  usageNotes?: string[];
  comingSoon?: boolean;
};

export const CORE_INCLUDED_SERVICE_SLUGS = ["inbox", "media-library", "tasks", "reporting"] as const;

export const PORTAL_ONBOARDING_PLANS: PortalOnboardingPlan[] = [
  {
    id: "core",
    title: "Core Portal",
    description: "Base access for your team. Includes Inbox/Outbox, Media Library, Tasks, and Reporting.",
    monthlyUsd: 39,
    serviceSlugsToActivate: [...CORE_INCLUDED_SERVICE_SLUGS],
    badges: ["Required"],
  },
  {
    id: "automations",
    title: "Automation Builder",
    description: "Build workflows and connect triggers to actions across your enabled services.",
    monthlyUsd: 79,
    serviceSlugsToActivate: ["automations"],
    requires: ["core"],
  },
  {
    id: "booking",
    title: "Booking Automation",
    description: "Calendar + confirmations, reminders, and post-booking follow-ups.",
    monthlyUsd: 29,
    serviceSlugsToActivate: ["booking"],
    requires: ["core"],
  },
  {
    id: "reviews",
    title: "Review Requests",
    description: "Verified listing + hosted Q&A page + automated review request flows.",
    monthlyUsd: 79,
    serviceSlugsToActivate: ["reviews"],
    requires: ["core"],
  },
  {
    id: "newsletter",
    title: "Newsletter",
    description: "4 sends per month included. Extra sends are usage-based credits.",
    monthlyUsd: 139,
    serviceSlugsToActivate: ["newsletter"],
    requires: ["core"],
    usageNotes: [],
  },
  {
    id: "nurture",
    title: "Nurture Campaigns",
    description: "One-time setup per campaign + monthly per active campaign.",
    monthlyUsd: 29,
    oneTimeUsd: 99,
    quantityConfig: {
      label: "Active campaigns to start with",
      min: 1,
      max: 10,
      default: 1,
    },
    serviceSlugsToActivate: ["nurture-campaigns"],
    requires: ["core"],
    usageNotes: ["$99 one-time install per campaign", "$29/month per active campaign"],
  },
  {
    id: "blogs",
    title: "Automated Blogs",
    description: "4 posts per month included. Extra posts are usage-based credits.",
    monthlyUsd: 149,
    serviceSlugsToActivate: ["blogs"],
    requires: ["core"],
    usageNotes: [],
  },
  {
    id: "ai-receptionist",
    title: "AI Receptionist (Inbound)",
    description: "Front desk-style inbound Q&A and routing.",
    monthlyUsd: 79,
    serviceSlugsToActivate: ["ai-receptionist"],
    requires: ["core"],
    usageNotes: [],
  },
  {
    id: "ai-outbound",
    title: "AI Outbound",
    description: "Outbound calling + AI message generation for follow-ups.",
    monthlyUsd: 99,
    serviceSlugsToActivate: ["ai-outbound-calls"],
    requires: ["core"],
    usageNotes: [],
  },
  {
    id: "lead-scraping-b2b",
    title: "Lead Scraping (B2B)",
    description: "Lead delivery for B2B prospecting.",
    monthlyUsd: 49,
    serviceSlugsToActivate: ["lead-scraping"],
    requires: ["core"],
    usageNotes: [],
  },
  {
    id: "lead-scraping-b2c",
    title: "Lead Scraping (B2C)",
    description: "Higher-volume consumer lead delivery.",
    monthlyUsd: 99,
    serviceSlugsToActivate: ["lead-scraping"],
    requires: ["core"],
    usageNotes: [],
  },
];

export const ONBOARDING_UPFRONT_PAID_PLAN_IDS = [
  "core",
  "automations",
  "booking",
  "reviews",
  "newsletter",
  "nurture",
  "blogs",
  "ai-receptionist",
  "ai-outbound",
  "lead-scraping-b2b",
  "lead-scraping-b2c",
] as const;

export function planById(id: string): PortalOnboardingPlan | null {
  const found = PORTAL_ONBOARDING_PLANS.find((p) => p.id === id);
  return found ?? null;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  const v = Math.trunc(n);
  return Math.max(min, Math.min(max, v));
}

export function planQuantity(plan: PortalOnboardingPlan, quantities?: Record<string, number> | null): number {
  const qRaw = quantities && typeof quantities[plan.id] === "number" ? quantities[plan.id] : undefined;
  const q = typeof qRaw === "number" && Number.isFinite(qRaw) ? Math.trunc(qRaw) : undefined;

  if (plan.quantityConfig) {
    const { min, max, default: def } = plan.quantityConfig;
    return clampInt(typeof q === "number" ? q : def, min, max);
  }

  return 1;
}

export function monthlyTotalUsd(planIds: string[], quantities?: Record<string, number> | null): number {
  const set = new Set(planIds);
  let total = 0;
  for (const p of PORTAL_ONBOARDING_PLANS) {
    if (!set.has(p.id)) continue;
    const qty = planQuantity(p, quantities);
    total += (p.monthlyUsd || 0) * qty;
  }
  return total;
}

export function oneTimeTotalUsd(planIds: string[], quantities?: Record<string, number> | null): number {
  const set = new Set(planIds);
  let total = 0;
  for (const p of PORTAL_ONBOARDING_PLANS) {
    if (!set.has(p.id)) continue;
    const qty = planQuantity(p, quantities);
    total += (p.oneTimeUsd || 0) * qty;
  }
  return total;
}

export function formatUsd(usd: number, opts?: { maximumFractionDigits?: number }) {
  const maximumFractionDigits = typeof opts?.maximumFractionDigits === "number" ? opts.maximumFractionDigits : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits,
    }).format(usd);
  } catch {
    const v = Math.round(usd * Math.pow(10, maximumFractionDigits)) / Math.pow(10, maximumFractionDigits);
    return `$${v.toFixed(maximumFractionDigits)}`;
  }
}

export function moneyLabel(monthlyUsd: number) {
  if (!monthlyUsd || monthlyUsd <= 0) return "$0/mo";
  return `${formatUsd(monthlyUsd, { maximumFractionDigits: 0 })}/mo`;
}

export function bundleTitle(id: PackagePreset) {
  if (id === "launch-kit") return "The Launch Kit";
  if (id === "sales-loop") return "The Sales Loop";
  return "The Brand Builder";
}

export function bundlePlanIds(id: PackagePreset): string[] {
  switch (id) {
    case "launch-kit":
      return ["core", "automations", "ai-receptionist", "blogs"];
    case "sales-loop":
      return ["core", "booking", "ai-receptionist", "lead-scraping-b2b", "ai-outbound"];
    case "brand-builder":
      return ["core", "blogs", "reviews", "newsletter", "nurture"];
  }
}

export const CALLS_RANGE_OPTIONS: Array<{ value: CallsPerMonthRange; label: string }> = [
  { value: "NOT_SURE", label: "Not sure" },
  { value: "0_10", label: "0-10" },
  { value: "11_30", label: "11-30" },
  { value: "31_60", label: "31-60" },
  { value: "61_120", label: "61-120" },
  { value: "120_PLUS", label: "120+" },
];
