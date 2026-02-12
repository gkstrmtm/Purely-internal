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

export function dueTodayUsd(planIds: string[], quantities?: Record<string, number> | null): number {
  return monthlyTotalUsd(planIds, quantities) + oneTimeTotalUsd(planIds, quantities);
}
