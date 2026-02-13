export type PortalModuleKey = "blog" | "booking" | "crm" | "leadOutbound";

export type PortalModuleCatalogItem = {
  key: PortalModuleKey;
  title: string;
  description: string;
  monthlyUsd: number;
  setupUsd: number;
  usageBased: boolean;
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
  },
  booking: {
    key: "booking",
    title: "Booking Automation",
    description: "Calendar + confirmations, reminders, and post-booking follow-ups.",
    monthlyUsd: 29,
    setupUsd: 0,
    usageBased: false,
  },
  crm: {
    key: "crm",
    title: "Follow-up Automation",
    description: "CRM + follow-up automation.",
    monthlyUsd: 79,
    setupUsd: 0,
    usageBased: false,
  },
  leadOutbound: {
    key: "leadOutbound",
    title: "AI Outbound",
    description: "Outbound calling + AI message generation for follow-ups.",
    monthlyUsd: 99,
    setupUsd: 0,
    usageBased: true,
  },
};

export function moduleByKey(key: PortalModuleKey): PortalModuleCatalogItem {
  return PORTAL_MODULE_CATALOG[key];
}

export function usdToCents(usd: number) {
  const n = typeof usd === "number" && Number.isFinite(usd) ? usd : 0;
  return Math.max(0, Math.round(n * 100));
}
