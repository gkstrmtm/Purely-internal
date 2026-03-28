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

  if (/(^|\.)cron\.run$/i.test(action) || action === "seed_demo.run") {
    return {
      title: "Confirm",
      message: "This action runs a background/system job and may affect many accounts. Continue?",
    };
  }

  // Explicit high-risk / destructive actions.
  if (
    action === "billing.subscriptions.cancel" ||
    action === "billing.subscriptions.cancel_by_id" ||
    action === "ads.click" ||
    action === "credits.topup.start" ||
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

function pickStringArg(args: Record<string, unknown> | undefined, key: string): string | null {
  if (!args) return null;
  const v = (args as any)[key];
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 200) : null;
}

export function portalCanvasUrlForAction(action: PortalAgentActionKey, args?: Record<string, unknown>): string | null {
  const a = String(action || "");
  const safeArgs = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : undefined;

  // Contacts.
  if (a.startsWith("contacts.")) {
    const contactId = pickStringArg(safeArgs, "contactId");
    return portalContactUiUrl(contactId);
  }

  // Portal users.
  if (a.startsWith("people.users.")) {
    const userId = pickStringArg(safeArgs, "userId");
    if (userId) return `/portal/app/people/users?userId=${encodeURIComponent(userId)}`;
    return "/portal/app/people/users";
  }

  // Inbox.
  if (a.startsWith("inbox.")) {
    const threadId = pickStringArg(safeArgs, "threadId");
    const channel = (pickStringArg(safeArgs, "channel") || pickStringArg(safeArgs, "inboxChannel")) as any;
    const to = pickStringArg(safeArgs, "to");
    const compose = a === "inbox.send" || a === "inbox.send_sms" || a === "inbox.send_email";
    return portalInboxUiUrl({
      channel: channel === "sms" || channel === "SMS" ? "sms" : channel === "email" || channel === "EMAIL" ? "email" : undefined,
      threadId,
      to,
      compose: compose || undefined,
    });
  }

  // Booking.
  if (a.startsWith("booking.")) {
    const bookingId = pickStringArg(safeArgs, "bookingId");
    if (a === "booking.reschedule") return portalBookingUiUrl({ bookingId, tab: "bookings", modal: "reschedule" });
    if (a === "booking.contact") return portalBookingUiUrl({ bookingId, tab: "bookings", modal: "contact" });
    if (bookingId) return portalBookingUiUrl({ bookingId, tab: "bookings" });
    if (a.startsWith("booking.reminders.")) return portalBookingUiUrl({ tab: "reminders" });
    if (a.startsWith("booking.settings.")) return portalBookingUiUrl({ tab: "settings" });
    return portalBookingUiUrl();
  }

  // Funnel Builder.
  if (a === "funnel.create" || a.startsWith("funnel_builder.")) {
    const formId = pickStringArg(safeArgs, "formId");
    if (formId) return `/portal/app/services/funnel-builder/forms/${encodeURIComponent(formId)}/edit`;

    const funnelId = pickStringArg(safeArgs, "funnelId");
    const pageId = pickStringArg(safeArgs, "pageId");
    if (funnelId) {
      const sp = new URLSearchParams();
      if (pageId) sp.set("pageId", pageId);
      const qs = sp.toString();
      return `/portal/app/services/funnel-builder/funnels/${encodeURIComponent(funnelId)}/edit${qs ? `?${qs}` : ""}`;
    }

    return "/portal/app/services/funnel-builder";
  }

  // Automations.
  if (a.startsWith("automations.")) {
    const automationId = pickStringArg(safeArgs, "automationId");
    if (automationId) return `/portal/app/services/automations/editor?automation=${encodeURIComponent(automationId)}`;
    return "/portal/app/services/automations";
  }

  // Blogs.
  if (a.startsWith("blogs.")) {
    const postId = pickStringArg(safeArgs, "postId");
    if (postId) return `/portal/app/services/blogs/${encodeURIComponent(postId)}`;
    return "/portal/app/services/blogs";
  }

  // Newsletter.
  if (a.startsWith("newsletter.")) {
    return "/portal/app/services/newsletter";
  }

  // Reviews.
  if (a.startsWith("reviews.")) {
    return "/portal/app/services/reviews";
  }

  // Media library.
  if (a.startsWith("media.")) {
    return "/portal/app/services/media-library";
  }

  // Lead scraping.
  if (a.startsWith("lead_scraping.")) {
    return "/portal/app/services/lead-scraping";
  }

  // Nurture campaigns.
  if (a.startsWith("nurture.")) {
    return "/portal/app/services/nurture-campaigns";
  }

  // Tasks.
  if (a.startsWith("tasks.")) {
    return "/portal/app/services/tasks";
  }

  // AI Outbound Calls.
  if (a.startsWith("ai_outbound_calls.")) {
    const campaignId = pickStringArg(safeArgs, "campaignId");
    if (campaignId) return `/portal/app/services/ai-outbound-calls?campaignId=${encodeURIComponent(campaignId)}`;
    return "/portal/app/services/ai-outbound-calls";
  }

  // AI Receptionist.
  if (a.startsWith("ai_receptionist.")) {
    return "/portal/app/services/ai-receptionist";
  }

  // Credit.
  if (a.startsWith("credit.disputes.") || a.startsWith("credit.pulls.")) {
    return "/portal/app/services/dispute-letters";
  }
  if (a.startsWith("credit.reports.")) {
    return "/portal/app/services/credit-reports";
  }

  return null;
}
