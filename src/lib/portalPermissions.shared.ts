export const PORTAL_SERVICE_KEYS = [
  "inbox",
  "outbox",
  "media",
  "blogs",
  "automations",
  "booking",
  "reviews",
  "leadScraping",
  "aiReceptionist",
  "followUp",
  "missedCallTextback",
  "reporting",
  "tasks",
  "integrations",
  "businessProfile",
  "people",
  "billing",
  "profile",
] as const;

export type PortalServiceKey = (typeof PORTAL_SERVICE_KEYS)[number];

export type PortalPermissions = Record<PortalServiceKey, boolean>;

export const PORTAL_SERVICE_LABELS: Record<PortalServiceKey, string> = {
  inbox: "Inbox",
  outbox: "Outbox",
  media: "Media",
  blogs: "Blogs",
  automations: "Automations",
  booking: "Booking",
  reviews: "Reviews",
  leadScraping: "Lead scraping",
  aiReceptionist: "AI receptionist",
  followUp: "Follow-up",
  missedCallTextback: "Missed call textback",
  reporting: "Reporting",
  tasks: "Tasks",
  integrations: "Integrations",
  businessProfile: "Business profile",
  people: "People",
  billing: "Billing",
  profile: "Profile",
};

export function defaultPortalPermissionsForRole(role: "OWNER" | "ADMIN" | "MEMBER"): PortalPermissions {
  const base = Object.fromEntries(PORTAL_SERVICE_KEYS.map((k) => [k, false])) as PortalPermissions;

  if (role === "OWNER" || role === "ADMIN") {
    for (const k of PORTAL_SERVICE_KEYS) base[k] = true;
    return base;
  }

  // MEMBER: day-to-day services on; sensitive/admin areas off.
  const allow: PortalServiceKey[] = [
    "inbox",
    "outbox",
    "media",
    "blogs",
    "automations",
    "booking",
    "reviews",
    "leadScraping",
    "aiReceptionist",
    "followUp",
    "missedCallTextback",
    "reporting",
    "tasks",
  ];

  for (const k of allow) base[k] = true;

  // Explicitly keep these off for members by default.
  base.billing = false;
  base.profile = false;
  base.people = false;
  base.integrations = false;
  base.businessProfile = false;

  return base;
}
