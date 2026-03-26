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
