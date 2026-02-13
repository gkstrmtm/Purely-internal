export type PortalModuleKey =
  | "blog"
  | "booking"
  | "automations"
  | "reviews"
  | "newsletter"
  | "nurture"
  | "aiReceptionist"
  | "leadOutbound"
  | "crm";

export type PortalModuleCatalogItem = {
  key: PortalModuleKey;
  title: string;
  description: string;
  monthlyUsd: number;
  setupUsd: number;
  usageBased: boolean;
  purchasable: boolean;
};

// Canonical in-code pricing for portal modules (used for Billing popups + Stripe inline price_data).
// This intentionally avoids relying on Stripe Price IDs/env vars.
export const PORTAL_MODULE_CATALOG: Record<PortalModuleKey, PortalModuleCatalogItem> = {
  blog: {
    key: "blog",
    title: "Automated Blogs",
    description: "4 posts per month included. Extra posts are usage-based credits.",
    monthlyUsd: 149,
    setupUsd: 0,
    usageBased: true,
    purchasable: true,
  },
  booking: {
    key: "booking",
    title: "Booking Automation",
    description: "Calendar + confirmations, reminders, and post-booking follow-ups.",
    monthlyUsd: 29,
    setupUsd: 0,
    usageBased: false,
    purchasable: true,
  },
  automations: {
    key: "automations",
    title: "Automation Builder",
    description: "Build workflows and connect triggers to actions across your enabled services.",
    monthlyUsd: 79,
    setupUsd: 0,
    usageBased: false,
    purchasable: true,
  },
  reviews: {
    key: "reviews",
    title: "Review Requests",
    description: "Verified listing + hosted Q&A page + automated review request flows.",
    monthlyUsd: 79,
    setupUsd: 0,
    usageBased: false,
    purchasable: true,
  },
  newsletter: {
    key: "newsletter",
    title: "Newsletter",
    description: "4 sends per month included. Extra sends are usage-based credits.",
    monthlyUsd: 139,
    setupUsd: 0,
    usageBased: true,
    purchasable: true,
  },
  nurture: {
    key: "nurture",
    title: "Nurture Campaigns",
    description: "One-time install + monthly per active campaign.",
    monthlyUsd: 29,
    setupUsd: 99,
    usageBased: false,
    purchasable: true,
  },
  aiReceptionist: {
    key: "aiReceptionist",
    title: "AI Receptionist (Inbound)",
    description: "Front desk-style inbound Q&A and routing.",
    monthlyUsd: 79,
    setupUsd: 0,
    usageBased: true,
    purchasable: true,
  },
  crm: {
    key: "crm",
    title: "Follow-up Automation",
    description: "Included with Booking Automation (no extra monthly charge).",
    monthlyUsd: 0,
    setupUsd: 0,
    usageBased: false,
    purchasable: false,
  },
  leadOutbound: {
    key: "leadOutbound",
    title: "AI Outbound",
    description: "Outbound calling + AI message generation for follow-ups.",
    monthlyUsd: 99,
    setupUsd: 0,
    usageBased: true,
    purchasable: true,
  },
};

export function moduleByKey(key: PortalModuleKey): PortalModuleCatalogItem {
  return PORTAL_MODULE_CATALOG[key];
}

export function usdToCents(usd: number) {
  const n = typeof usd === "number" && Number.isFinite(usd) ? usd : 0;
  return Math.max(0, Math.round(n * 100));
}
