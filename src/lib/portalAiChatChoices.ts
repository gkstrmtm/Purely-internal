import { prisma } from "@/lib/db";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";

type ChoiceOverrides = Record<string, unknown>;

function mapKindToKey(kind: string) {
  const k = String(kind || "").trim();
  if (!k) return null as string | null;
  const kn = k.toLowerCase();

  // Known kinds map to stable keys used by the resolver.
  if (kn === "booking_calendar" || kn === "booking_calendar_id") return "bookingCalendarId";
  if (kn === "contact" || kn === "contact_id") return "contactId";
  if (kn === "user" || kn === "user_id" || kn === "portal_user" || kn === "portal_user_id") return "userId";
  if (kn === "funnel" || kn === "funnel_id") return "funnelId";
  if (kn === "automation" || kn === "automation_id") return "automationId";
  if (kn === "booking" || kn === "booking_id") return "bookingId";
  if (kn === "funnel_page" || kn === "page" || kn === "page_id" || kn === "funnel_page_id") return "funnelPageId";
  if (kn === "funnel_form" || kn === "form" || kn === "form_id" || kn === "funnel_form_id") return "funnelFormId";
  if (kn === "custom_domain" || kn === "domain" || kn === "domain_id" || kn === "custom_domain_id") return "customDomainId";
  if (kn === "nurture_campaign" || kn === "nurture_campaign_id") return "nurtureCampaignId";

  // Fallback: store under a sanitized key.
  return k.replace(/[^a-z0-9]+/gi, "_");
}

export async function validateChoiceOverride(ownerId: string, key: string, value: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (key === "bookingCalendarId") {
    try {
      const cfg = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] as any[] }));
      const found = (cfg.calendars || []).some((c: any) => String(c.id || "") === String(value));
      if (!found) return { ok: false, error: "Unknown calendar" };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: "Validation failed" };
    }
  }

  if (key === "contactId") {
    const v = String(value || "").trim();
    const found = await (prisma as any).portalContact.findFirst({ where: { ownerId: String(ownerId), id: v }, select: { id: true } }).catch(() => null);
    if (!found?.id) return { ok: false, error: "Unknown contact" };
    return { ok: true };
  }

  if (key === "userId") {
    const v = String(value || "").trim();
    const found = await prisma.user.findUnique({ where: { id: v }, select: { id: true } }).catch(() => null);
    if (!found?.id) return { ok: false, error: "Unknown user" };
    return { ok: true };
  }

  if (key === "funnelId") {
    const v = String(value || "").trim();
    const found = await prisma.creditFunnel.findFirst({ where: { ownerId: String(ownerId), id: v }, select: { id: true } }).catch(() => null);
    if (!found?.id) return { ok: false, error: "Unknown funnel" };
    return { ok: true };
  }

  if (key === "bookingId") {
    const v = String(value || "").trim();
    const found = await prisma.portalBooking.findFirst({ where: { id: v, site: { ownerId: String(ownerId) } }, select: { id: true } }).catch(() => null);
    if (!found?.id) return { ok: false, error: "Unknown booking" };
    return { ok: true };
  }

  if (key === "automationId") {
    const v = String(value || "").trim();
    const row = await prisma.portalServiceSetup
      .findUnique({ where: { ownerId_serviceSlug: { ownerId: String(ownerId), serviceSlug: "automations" } }, select: { dataJson: true } })
      .catch(() => null);
    const dataJson = (row?.dataJson ?? null) as any;
    const list = Array.isArray(dataJson?.automations) ? (dataJson.automations as any[]) : [];
    const found = list.some((a) => String(a?.id || "").trim() === v);
    if (!found) return { ok: false, error: "Unknown automation" };
    return { ok: true };
  }

  if (key === "nurtureCampaignId") {
    const v = String(value || "").trim();
    if (v === "__create_new__") return { ok: true };
    const found = await prisma.portalNurtureCampaign
      .findFirst({ where: { ownerId: String(ownerId), id: v }, select: { id: true } })
      .catch(() => null);
    if (!found?.id) return { ok: false, error: "Unknown campaign" };
    return { ok: true };
  }

  // Default: accept non-empty string
  if (!String(value || "").trim()) return { ok: false, error: "Empty value" };
  return { ok: true };
}

export async function setThreadChoiceOverride(opts: {
  ownerId: string;
  threadId: string;
  kind: string;
  value: string;
}): Promise<{ ok: true; choiceOverrides: ChoiceOverrides } | { ok: false; error: string }> {
  const { ownerId, threadId, kind, value } = opts;
  const key = mapKindToKey(kind);
  if (!key) return { ok: false, error: "Unsupported choice kind" };

  const v = String(value || "").trim().slice(0, 200);
  if (!v) return { ok: false, error: "Empty value" };

  const valid = await validateChoiceOverride(ownerId, key, v);
  if (!valid.ok) return { ok: false, error: valid.error };

  const thread = await (prisma as any).portalAiChatThread.findFirst({ where: { id: threadId, ownerId }, select: { id: true, contextJson: true } });
  if (!thread) return { ok: false, error: "Not found" };

  const prevCtx = thread.contextJson && typeof thread.contextJson === "object" && !Array.isArray(thread.contextJson) ? (thread.contextJson as Record<string, unknown>) : {};
  const prevOverrides = prevCtx.choiceOverrides && typeof prevCtx.choiceOverrides === "object" && !Array.isArray(prevCtx.choiceOverrides) ? { ...(prevCtx.choiceOverrides as Record<string, unknown>) } : {};

  (prevOverrides as any)[key] = v;

  const nextCtx = { ...(prevCtx || {}), choiceOverrides: prevOverrides };

  await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });

  return { ok: true, choiceOverrides: prevOverrides };
}

export function getChoiceOverridesFromThread(thread: { contextJson?: unknown }): ChoiceOverrides {
  const ctx = thread && typeof thread === "object" && thread.contextJson && typeof thread.contextJson === "object" && !Array.isArray(thread.contextJson) ? (thread.contextJson as any) : {};
  const out = ctx.choiceOverrides && typeof ctx.choiceOverrides === "object" && !Array.isArray(ctx.choiceOverrides) ? { ...(ctx.choiceOverrides as Record<string, unknown>) } : {};
  return out;
}

export async function clearThreadChoiceOverride(opts: { ownerId: string; threadId: string; kind: string }) {
  const { ownerId, threadId, kind } = opts;
  const key = mapKindToKey(kind);
  if (!key) return { ok: false, error: "Unsupported choice kind" };

  const thread = await (prisma as any).portalAiChatThread.findFirst({ where: { id: threadId, ownerId }, select: { id: true, contextJson: true } });
  if (!thread) return { ok: false, error: "Not found" };

  const prevCtx = thread.contextJson && typeof thread.contextJson === "object" && !Array.isArray(thread.contextJson) ? (thread.contextJson as Record<string, unknown>) : {};
  const prevOverrides = prevCtx.choiceOverrides && typeof prevCtx.choiceOverrides === "object" && !Array.isArray(prevCtx.choiceOverrides) ? { ...(prevCtx.choiceOverrides as Record<string, unknown>) } : {};

  if (Object.prototype.hasOwnProperty.call(prevOverrides, key)) {
    delete (prevOverrides as any)[key];
  }

  const nextCtx = { ...(prevCtx || {}), choiceOverrides: prevOverrides };
  await (prisma as any).portalAiChatThread.update({ where: { id: threadId }, data: { contextJson: nextCtx } });
  return { ok: true, choiceOverrides: prevOverrides };
}

export default null as unknown;
