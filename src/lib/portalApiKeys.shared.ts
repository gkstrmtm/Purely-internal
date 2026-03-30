export const PORTAL_API_KEY_PERMISSION_OPTIONS = [
  {
    value: "pura.chat",
    label: "Pura chat",
    description: "Create threads, send messages, and use Pura or AI agents in your own software.",
  },
  {
    value: "booking",
    label: "Booking",
    description: "Read and update calendars, bookings, reminders, and booking forms.",
  },
  {
    value: "automations",
    label: "Automation builder",
    description: "Run and manage automation workflows, test sends, and automation settings.",
  },
  {
    value: "funnelBuilder",
    label: "Funnels",
    description: "Manage funnel builder funnels, forms, settings, custom domains, and DNS records.",
  },
  {
    value: "leadScraping",
    label: "Lead scraping",
    description: "Run scraping jobs, manage leads, outbound drafts, and lead settings.",
  },
  {
    value: "media",
    label: "Media library",
    description: "Upload and manage media folders, files, and assets.",
  },
  {
    value: "tasks",
    label: "Tasks",
    description: "Read and update portal tasks and task assignments.",
  },
  {
    value: "nurtureCampaigns",
    label: "Nurture",
    description: "Manage nurture campaigns, steps, enrollments, and AI-generated nurture content.",
  },
  {
    value: "reviews",
    label: "Reviews",
    description: "Read and manage reviews, replies, questions, events, and review outreach.",
  },
  {
    value: "blogs",
    label: "Blogs",
    description: "Create and manage blog posts, automation, site settings, and blog usage.",
  },
  {
    value: "newsletter",
    label: "Newsletter",
    description: "Manage newsletter audience, automations, sends, site settings, and usage.",
  },
  {
    value: "aiOutboundCalls",
    label: "AI outbound",
    description: "Access AI outbound campaigns, manual calls, recordings, and campaign tools.",
  },
  {
    value: "aiReceptionist",
    label: "AI receptionist",
    description: "Manage receptionist settings, previews, knowledge base sync, and call tooling.",
  },
  {
    value: "people",
    label: "People",
    description: "Read and update contacts, users, tags, leads, and custom variables.",
  },
  {
    value: "reporting",
    label: "Sales dashboard",
    description: "Read reporting, Stripe sales reporting, and dashboard analytics data.",
  },
  {
    value: "inbox",
    label: "Inbox",
    description: "Read threads, attachments, send messages, and manage inbox settings.",
  },
  {
    value: "twilio",
    label: "Twilio",
    description: "Read or update Twilio connection data for the account.",
  },
  {
    value: "webhooks",
    label: "Webhooks",
    description: "Read webhook endpoints and integration callback details.",
  },
] as const;

export const PORTAL_API_KEY_PERMISSION_VALUES = PORTAL_API_KEY_PERMISSION_OPTIONS.map((option) => option.value);

export type PortalApiKeyPermission = (typeof PORTAL_API_KEY_PERMISSION_OPTIONS)[number]["value"];

export type PortalApiKeyKind = "FULL_ACCESS" | "SCOPED";

export type PortalApiKeySummary = {
  id: string;
  kind: PortalApiKeyKind;
  name: string;
  maskedValue: string;
  permissions: PortalApiKeyPermission[];
  creditLimit: number | null;
  creditsUsed: number;
  createdAtIso: string;
  lastUsedAtIso: string | null;
};

export type PortalApiKeysPayload = {
  ok: true;
  encryptionConfigured: boolean;
  fullAccessKey: PortalApiKeySummary | null;
  scopedKeys: PortalApiKeySummary[];
  totalKeyCount: number;
  totalCreditsUsed: number;
};

export function normalizePortalApiKeyPermissions(input: unknown): PortalApiKeyPermission[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(PORTAL_API_KEY_PERMISSION_VALUES);
  const seen = new Set<string>();
  const out: PortalApiKeyPermission[] = [];
  for (const value of input) {
    const next = typeof value === "string" ? value.trim() : "";
    if (!next || seen.has(next) || !allowed.has(next)) continue;
    seen.add(next);
    out.push(next as PortalApiKeyPermission);
  }
  return out;
}

export function permissionLabel(permission: PortalApiKeyPermission): string {
  return PORTAL_API_KEY_PERMISSION_OPTIONS.find((option) => option.value === permission)?.label ?? permission;
}
