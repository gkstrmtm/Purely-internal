export const PORTAL_SERVICE_KEYS = [
  "inbox",
  "outbox",
  "media",
  "blogs",
  "newsletter",
  "nurtureCampaigns",
  "automations",
  "booking",
  "reviews",
  "leadScraping",
  "aiReceptionist",
  "aiOutboundCalls",
  "followUp",
  "missedCallTextback",
  "reporting",
  "tasks",
  "integrations",
  "twilio",
  "webhooks",
  "businessProfile",
  "people",
  "billing",
  "profile",
] as const;

export type PortalServiceKey = (typeof PORTAL_SERVICE_KEYS)[number];

export type PortalServicePermissions = {
  view: boolean;
  edit: boolean;
};

export type PortalPermissions = Record<PortalServiceKey, PortalServicePermissions>;

export const PORTAL_SERVICE_LABELS: Record<PortalServiceKey, string> = {
  inbox: "Inbox",
  outbox: "Outbox",
  media: "Media",
  blogs: "Blogs",
  newsletter: "Newsletter",
  nurtureCampaigns: "Nurture campaigns",
  automations: "Automations",
  booking: "Booking",
  reviews: "Reviews",
  leadScraping: "Lead scraping",
  aiReceptionist: "AI receptionist",
  aiOutboundCalls: "AI outbound calls",
  followUp: "Follow-up",
  missedCallTextback: "Missed call textback",
  reporting: "Reporting",
  tasks: "Tasks",
  integrations: "Integrations",
  twilio: "Twilio",
  webhooks: "Webhooks",
  businessProfile: "Business info",
  people: "People",
  billing: "Billing",
  profile: "Profile",
};

export function defaultPortalPermissionsForRole(role: "OWNER" | "ADMIN" | "MEMBER"): PortalPermissions {
  const base = Object.fromEntries(
    PORTAL_SERVICE_KEYS.map((k) => [k, { view: false, edit: false }]),
  ) as PortalPermissions;

  if (role === "OWNER" || role === "ADMIN") {
    for (const k of PORTAL_SERVICE_KEYS) base[k] = { view: true, edit: true };
    return base;
  }

  // MEMBER: day-to-day services on; sensitive/admin areas off.
  const allow: PortalServiceKey[] = [
    "inbox",
    "outbox",
    "media",
    "blogs",
    "newsletter",
    "nurtureCampaigns",
    "automations",
    "booking",
    "reviews",
    "leadScraping",
    "aiReceptionist",
    "aiOutboundCalls",
    "followUp",
    "missedCallTextback",
    "reporting",
    "tasks",
    "profile",
  ];

  for (const k of allow) base[k] = { view: true, edit: true };

  // Explicitly keep these off for members by default.
  base.billing = { view: false, edit: false };
  base.people = { view: false, edit: false };
  base.integrations = { view: false, edit: false };
  base.twilio = { view: false, edit: false };
  base.webhooks = { view: false, edit: false };
  base.businessProfile = { view: false, edit: false };

  return base;
}
