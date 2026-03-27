import { listPortalAccountMembers } from "@/lib/portalAccounts";

export type PortalAiChatThreadLike = {
  ownerId?: string | null;
  createdByUserId?: string | null;
  contextJson?: unknown;
};

function readStringArray(value: unknown, max = 200): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    if (s.length > 120) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return Array.from(new Set(out));
}

export function getSharedWithUserIdsFromThreadContext(contextJson: unknown): string[] {
  const ctx = contextJson && typeof contextJson === "object" && !Array.isArray(contextJson)
    ? (contextJson as Record<string, unknown>)
    : null;
  const raw = ctx ? (ctx as any).sharedWithUserIds : null;
  return readStringArray(raw, 200);
}

export function setSharedWithUserIdsInThreadContext(contextJson: unknown, userIds: string[]): Record<string, unknown> {
  const ctx = contextJson && typeof contextJson === "object" && !Array.isArray(contextJson)
    ? ({ ...(contextJson as Record<string, unknown>) } as Record<string, unknown>)
    : ({} as Record<string, unknown>);

  (ctx as any).sharedWithUserIds = readStringArray(userIds, 200);
  return ctx;
}

export function canAccessPortalAiChatThread(opts: { thread: PortalAiChatThreadLike; memberId: string }): boolean {
  const memberId = String(opts.memberId || "").trim();
  if (!memberId) return false;
  const createdByUserId = typeof opts.thread.createdByUserId === "string" ? opts.thread.createdByUserId : null;
  const ownerId = typeof opts.thread.ownerId === "string" ? opts.thread.ownerId : null;
  const effectiveOwner = createdByUserId || ownerId;
  if (effectiveOwner && effectiveOwner === memberId) return true;

  const sharedWithUserIds = getSharedWithUserIdsFromThreadContext(opts.thread.contextJson);
  return sharedWithUserIds.includes(memberId);
}

export function isPortalAiChatThreadOwner(opts: { thread: PortalAiChatThreadLike; memberId: string }): boolean {
  const memberId = String(opts.memberId || "").trim();
  if (!memberId) return false;
  const createdByUserId = typeof opts.thread.createdByUserId === "string" ? opts.thread.createdByUserId : null;
  const ownerId = typeof opts.thread.ownerId === "string" ? opts.thread.ownerId : null;
  const effectiveOwner = createdByUserId || ownerId;
  return Boolean(effectiveOwner && effectiveOwner === memberId);
}

export async function listShareablePortalAccountUsers(ownerId: string) {
  const ownerIdClean = String(ownerId || "").trim();
  if (!ownerIdClean) return [] as Array<{ userId: string; name: string; email: string }>;

  const members = await listPortalAccountMembers(ownerIdClean).catch(() => [] as any[]);

  const merged = members
    .map((m: any) => ({
      userId: String(m.userId || "").trim(),
      email: String(m.user?.email || "").trim(),
      name: String(m.user?.name || "").trim(),
      active: Boolean(m.user?.active ?? true),
    }))
    .filter((m: any) => Boolean(m.userId) && Boolean(m.email) && m.active);

  // Note: owner user is stored as a portalAccountMember in most cases, but keep dedupe.
  const uniq = new Map<string, { userId: string; name: string; email: string }>();
  for (const m of merged) {
    if (!uniq.has(m.userId)) uniq.set(m.userId, { userId: m.userId, name: m.name || m.email, email: m.email });
  }

  return Array.from(uniq.values()).slice(0, 500);
}
