export type PortalContactVars = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  businessName?: string | null;
  tags?: string[] | null;
  customVariables?: Record<string, string> | null;
};

export type PortalBusinessVars = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type PortalUserVars = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type PortalMessageVars = {
  from?: string | null;
  to?: string | null;
  body?: string | null;
};

export type PortalTemplateContext = {
  contact?: PortalContactVars | null;
  business?: PortalBusinessVars | null;
  owner?: PortalUserVars | null;
  user?: PortalUserVars | null;
  message?: PortalMessageVars | null;
};

function firstNameFromName(nameRaw: string | null | undefined) {
  const name = String(nameRaw ?? "").trim();
  if (!name) return "";
  const first = name.split(/\s+/g)[0] || "";
  return first;
}

function normalizeCustomVarKey(raw: string): string {
  const s = String(raw ?? "").trim().toLowerCase();
  const cleaned = s
    .replace(/[^a-z0-9\s_-]+/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return cleaned;
}

export function normalizePortalContactCustomVarKey(raw: string): string {
  return normalizeCustomVarKey(raw);
}

export function buildPortalTemplateVars(ctx: PortalTemplateContext): Record<string, string> {
  const contactName = String(ctx.contact?.name ?? "").trim();
  const contactEmail = String(ctx.contact?.email ?? "").trim();
  const contactPhone = String(ctx.contact?.phone ?? "").trim();
  const contactId = String(ctx.contact?.id ?? "").trim();
  const rawCustom = ctx.contact?.customVariables;

  const contactBusinessName = (() => {
    const direct = String(ctx.contact?.businessName ?? "").trim();
    if (direct) return direct;
    if (!rawCustom || typeof rawCustom !== "object" || Array.isArray(rawCustom)) return "";

    const candidates = new Set(["business_name", "businessname", "company_name", "company"]);
    for (const [k, v] of Object.entries(rawCustom)) {
      const key = normalizeCustomVarKey(k);
      if (!key || !candidates.has(key)) continue;
      const value = String(v ?? "").trim();
      if (value) return value;
    }

    return "";
  })();

  const contactTags = (() => {
    const raw = ctx.contact?.tags;
    if (!Array.isArray(raw)) return "";
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of raw) {
      const name = String(t ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name.slice(0, 60));
      if (out.length >= 20) break;
    }
    return out.join(", ");
  })();

  const businessName = String(ctx.business?.name ?? "").trim();
  const businessEmail = String(ctx.business?.email ?? "").trim();
  const businessPhone = String(ctx.business?.phone ?? "").trim();

  const ownerName = String(ctx.owner?.name ?? "").trim();
  const ownerEmail = String(ctx.owner?.email ?? "").trim();
  const ownerPhone = String(ctx.owner?.phone ?? "").trim();

  const userName = String(ctx.user?.name ?? "").trim();
  const userEmail = String(ctx.user?.email ?? "").trim();
  const userPhone = String(ctx.user?.phone ?? "").trim();

  const messageFrom = String(ctx.message?.from ?? "").trim();
  const messageTo = String(ctx.message?.to ?? "").trim();
  const messageBody = String(ctx.message?.body ?? "");

  const vars: Record<string, string> = {
    // Canonical dotted keys
    "contact.id": contactId,
    "contact.name": contactName,
    "contact.firstName": firstNameFromName(contactName),
    "contact.email": contactEmail,
    "contact.phone": contactPhone,
    "contact.businessName": contactBusinessName,
    "contact.tags": contactTags,

    "business.name": businessName,
    "business.email": businessEmail,
    "business.phone": businessPhone,

    "owner.name": ownerName,
    "owner.email": ownerEmail,
    "owner.phone": ownerPhone,

    "user.name": userName,
    "user.email": userEmail,
    "user.phone": userPhone,

    "message.from": messageFrom,
    "message.to": messageTo,
    "message.body": messageBody,

    // Legacy aliases used in other portal modules
    name: contactName,
    business: businessName,
    contactName,
    contactFirstName: firstNameFromName(contactName),
    contactEmail,
    contactPhone,
    contactBusinessName,
    contactTags,
    businessName,
    businessEmail,
    businessPhone,
    ownerName,
    ownerEmail,
    ownerPhone,
    userName,
    messageBody,
    messageFrom,
    messageTo,
  };

  if (rawCustom && typeof rawCustom === "object" && !Array.isArray(rawCustom)) {
    for (const [k, v] of Object.entries(rawCustom)) {
      const key = normalizeCustomVarKey(k);
      if (!key) continue;
      const value = String(v ?? "").trim();
      vars[`contact.custom.${key}`] = value;
    }
  }

  return vars;
}

export type VariableGroup = "Contact" | "Business" | "Owner" | "User" | "Message" | "Lead" | "Booking" | "Custom";

export type TemplateVariable = {
  key: string;
  label: string;
  group: VariableGroup;
  appliesTo: string;
};

export const PORTAL_MESSAGE_VARIABLES: TemplateVariable[] = [
  { key: "contact.name", label: "Contact name", group: "Contact", appliesTo: "Lead/contact" },
  { key: "contact.firstName", label: "Contact first name", group: "Contact", appliesTo: "Lead/contact" },
  { key: "contact.email", label: "Contact email", group: "Contact", appliesTo: "Lead/contact" },
  { key: "contact.phone", label: "Contact phone", group: "Contact", appliesTo: "Lead/contact" },
  { key: "contact.businessName", label: "Contact business name", group: "Contact", appliesTo: "Lead/contact" },
  { key: "contact.tags", label: "Contact tags", group: "Contact", appliesTo: "Lead/contact" },

  { key: "business.name", label: "Your business name", group: "Business", appliesTo: "Your business" },
  { key: "business.email", label: "Your business email", group: "Business", appliesTo: "Your business" },
  { key: "business.phone", label: "Your business phone", group: "Business", appliesTo: "Your business" },

  { key: "owner.email", label: "Account owner email", group: "Owner", appliesTo: "You (account owner)" },
  { key: "owner.phone", label: "Account owner phone", group: "Owner", appliesTo: "You (account owner)" },

  { key: "message.body", label: "Inbound message body", group: "Message", appliesTo: "Message event" },
  { key: "message.from", label: "Inbound message from", group: "Message", appliesTo: "Message event" },
  { key: "message.to", label: "Inbound message to", group: "Message", appliesTo: "Message event" },

  { key: "user.name", label: "Assigned user name", group: "User", appliesTo: "Employee/user" },
  { key: "user.email", label: "Assigned user email", group: "User", appliesTo: "Employee/user" },
];

export const PORTAL_BOOKING_VARIABLES: TemplateVariable[] = [
  { key: "when", label: "Appointment time", group: "Booking", appliesTo: "Booking" },
  { key: "timeZone", label: "Time zone", group: "Booking", appliesTo: "Booking" },
  { key: "startAt", label: "Start time (ISO)", group: "Booking", appliesTo: "Booking" },
  { key: "endAt", label: "End time (ISO)", group: "Booking", appliesTo: "Booking" },
  { key: "bookingTitle", label: "Booking title", group: "Booking", appliesTo: "Booking" },
  { key: "calendarTitle", label: "Calendar title", group: "Booking", appliesTo: "Booking" },
  { key: "location", label: "Location / meeting link", group: "Booking", appliesTo: "Booking" },
  { key: "meetingLink", label: "Meeting link only", group: "Booking", appliesTo: "Booking" },
];

export const PORTAL_MISSED_CALL_VARIABLES: TemplateVariable[] = [
  { key: "from", label: "Caller number", group: "Message", appliesTo: "Missed call" },
  { key: "to", label: "Dialed number", group: "Message", appliesTo: "Missed call" },
];

export const PORTAL_LINK_VARIABLES: TemplateVariable[] = [
  { key: "link", label: "Link", group: "Custom", appliesTo: "This message" },
];

export const LEAD_OUTBOUND_VARIABLES: TemplateVariable[] = [
  { key: "businessName", label: "Lead business name", group: "Lead", appliesTo: "Lead" },
  { key: "phone", label: "Lead phone", group: "Lead", appliesTo: "Lead" },
  { key: "website", label: "Lead website", group: "Lead", appliesTo: "Lead" },
  { key: "address", label: "Lead address", group: "Lead", appliesTo: "Lead" },
  { key: "niche", label: "Lead niche", group: "Lead", appliesTo: "Lead" },
];
