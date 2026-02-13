export const MODULE_KEYS = [
  "blog",
  "booking",
  "automations",
  "reviews",
  "newsletter",
  "nurture",
  "aiReceptionist",
  "crm",
  "leadOutbound",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Entitlements = Record<ModuleKey, boolean>;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  blog: "Blogs",
  booking: "Booking",
  automations: "Automations",
  reviews: "Reviews",
  newsletter: "Newsletter",
  nurture: "Nurture",
  aiReceptionist: "AI Receptionist",
  crm: "CRM / Follow-up",
  leadOutbound: "AI Outbound",
};
