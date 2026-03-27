import { prisma } from "@/lib/db";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";

type ChoiceOverrides = Record<string, unknown>;

function mapKindToKey(kind: string) {
  const k = String(kind || "").trim();
  if (!k) return null as string | null;
  if (k === "booking_calendar" || k === "booking_calendar_id") return "bookingCalendarId";
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
