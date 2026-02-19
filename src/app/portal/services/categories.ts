import type { PortalService } from "@/app/portal/services/catalog";

export type PortalServiceCategory =
  | "communication"
  | "marketing"
  | "automation"
  | "leads"
  | "operations"
  | "analytics"
  | "other";

export const PORTAL_SERVICE_CATEGORY_ORDER: PortalServiceCategory[] = [
  "communication",
  "marketing",
  "automation",
  "leads",
  "operations",
  "analytics",
  "other",
];

export const PORTAL_SERVICE_CATEGORY_LABELS: Record<PortalServiceCategory, string> = {
  communication: "Inbox, SMS, and calls",
  marketing: "Marketing and reputation",
  automation: "Automations and booking",
  leads: "Lead generation",
  operations: "Operations",
  analytics: "Reporting",
  other: "Other",
};

export function portalServiceCategoryForSlug(slug: string): PortalServiceCategory {
  switch (slug) {
    case "inbox":
    case "ai-receptionist":
    case "ai-outbound-calls":
    case "missed-call-textback":
      return "communication";

    case "newsletter":
    case "blogs":
    case "reviews":
    case "nurture-campaigns":
      return "marketing";

    case "automations":
    case "booking":
    case "follow-up":
      return "automation";

    case "lead-scraping":
    case "funnel-builder":
      return "leads";

    case "media-library":
    case "tasks":
      return "operations";

    case "reporting":
      return "analytics";

    default:
      return "other";
  }
}

export type PortalServiceGroup = {
  key: PortalServiceCategory;
  title: string;
  services: PortalService[];
};

export function groupPortalServices(services: PortalService[]): PortalServiceGroup[] {
  const buckets = new Map<PortalServiceCategory, PortalService[]>();

  for (const service of services) {
    const category = portalServiceCategoryForSlug(service.slug);
    const existing = buckets.get(category);
    if (existing) existing.push(service);
    else buckets.set(category, [service]);
  }

  return PORTAL_SERVICE_CATEGORY_ORDER.map((key) => {
    return {
      key,
      title: PORTAL_SERVICE_CATEGORY_LABELS[key],
      services: buckets.get(key) ?? [],
    };
  }).filter((g) => g.services.length > 0);
}
