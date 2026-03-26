import type { PortalAgentActionKey } from "@/lib/portalAgentActions";

export type PortalAgentConfirmSpec = {
  title: string;
  message: string;
};

const NO_CONFIRM_KEYS = new Set<PortalAgentActionKey>([
  // Low-risk, common day-to-day actions.
  "contacts.tags.add",
  "contacts.tags.remove",
  "contacts.update",
  "contacts.create",
  "tasks.create",
  "tasks.update",
]);

export function getConfirmSpecForPortalAgentAction(action: PortalAgentActionKey): PortalAgentConfirmSpec | null {
  if (NO_CONFIRM_KEYS.has(action)) return null;

  // Explicit high-risk / destructive actions.
  if (
    action === "billing.subscriptions.cancel" ||
    action === "billing.subscriptions.cancel_by_id" ||
    action === "integrations.stripe.delete" ||
    action === "integrations.sales_reporting.disconnect" ||
    action === "tasks.create_for_all" ||
    action === "booking.cancel"
  ) {
    return {
      title: "Confirm",
      message: "This action is destructive or high-impact and may not be reversible. Continue?",
    };
  }

  // Pattern-based fallbacks.
  if (
    /(^|\.)delete$/i.test(action) ||
    /(^|\.)archive$/i.test(action) ||
    /(^|\.)cancel(\b|_)/i.test(action) ||
    /(^|\.)disconnect$/i.test(action) ||
    /(^|\.)reset$/i.test(action)
  ) {
    return {
      title: "Confirm",
      message: "This action can remove or change data. Continue?",
    };
  }

  return null;
}

export function portalContactUiUrl(contactId?: string | null): string {
  const id = String(contactId || "").trim();
  if (!id) return "/portal/app/people/contacts";
  return `/portal/app/people/contacts?contactId=${encodeURIComponent(id)}`;
}

export type PortalInboxUiChannel = "email" | "sms";

function normalizeInboxChannelUi(chRaw?: string | null): PortalInboxUiChannel {
  const s = String(chRaw || "").trim().toLowerCase();
  if (s === "sms") return "sms";
  return "email";
}

export function portalInboxUiUrl(opts?: {
  channel?: PortalInboxUiChannel | "EMAIL" | "SMS" | null;
  threadId?: string | null;
  to?: string | null;
  compose?: boolean | null;
}): string {
  const channel = normalizeInboxChannelUi(opts?.channel ? String(opts.channel) : null);
  const threadId = String(opts?.threadId || "").trim();
  const to = String(opts?.to || "").trim();
  const compose = Boolean(opts?.compose);

  const sp = new URLSearchParams();
  if (threadId) sp.set("threadId", threadId);
  if (to) sp.set("to", to);
  if (compose) sp.set("compose", "1");
  const qs = sp.toString();

  return `/portal/app/services/inbox/${channel}${qs ? `?${qs}` : ""}`;
}

export type PortalBookingUiTab = "appointments" | "bookings" | "reminders" | "follow-up" | "settings";
export type PortalBookingUiModal = "contact" | "reschedule";

export function portalBookingUiUrl(opts?: {
  tab?: PortalBookingUiTab | null;
  bookingId?: string | null;
  modal?: PortalBookingUiModal | null;
}): string {
  const bookingId = String(opts?.bookingId || "").trim();
  const tab = ((): PortalBookingUiTab => {
    const t = String(opts?.tab || "").trim();
    if (t === "appointments" || t === "bookings" || t === "reminders" || t === "follow-up" || t === "settings") return t;
    if (bookingId) return "bookings";
    return "appointments";
  })();
  const modalRaw = String(opts?.modal || "").trim();
  const modal = modalRaw === "contact" || modalRaw === "reschedule" ? (modalRaw as PortalBookingUiModal) : null;

  const sp = new URLSearchParams();
  if (tab !== "appointments") sp.set("tab", tab);
  if (bookingId) sp.set("bookingId", bookingId);
  if (modal) sp.set("modal", modal);

  const qs = sp.toString();
  return `/portal/app/services/booking${qs ? `?${qs}` : ""}`;
}
